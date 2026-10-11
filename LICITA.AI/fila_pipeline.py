from __future__ import annotations

import json
import os
import re

import httpx


API_UNSLOTH_URL = os.getenv("LICITA_UNSLOTH_URL", os.getenv("UNSLOTH_URL", "http://127.0.0.1:8888/v1")).rstrip("/")
API_UNSLOTH_KEY = os.getenv("LICITA_UNSLOTH_KEY", os.getenv("API_UNSLOTH", "")).strip()
AI_TIMEOUT_SECONDS = max(60, int(os.getenv("LICITA_QUEUE_AI_TIMEOUT", "600")))

_PIPE_DFD = "__LICITA_PIPE_DFD__"
_PIPE_ETP = "__LICITA_PIPE_ETP__"
_PIPE_DATA = "__LICITA_PIPE_DADOS_USUARIO__"
_PIPE_STAGES = "__LICITA_PIPE_ETAPAS__"


def _dados_para_prompt(dados_usuario: dict) -> dict:
    """Remove imagens/base64 e campos internos antes de enviar os dados ao modelo."""
    dados = dict(dados_usuario or {})
    dotacao = str(dados.get("{{DOTACAO}}") or "")
    caminho_imagem = str(dados.get("{{CAMINHO_IMAGEM_DOTACAO}}") or "")
    imagens = dotacao.count("__IMG__") + (1 if caminho_imagem else 0)
    linhas = [
        linha for linha in dotacao.splitlines()
        if linha.strip() and not linha.strip().startswith("__IMG__") and not linha.strip().startswith("data:image/")
    ]
    texto_dotacao = "\n".join(linhas).strip()
    if imagens:
        rotulo = f"Dotação informada ({imagens} imagem(ns)" + (" e texto)" if texto_dotacao else ")")
        dados["{{DOTACAO}}"] = "\n".join(parte for parte in (rotulo, texto_dotacao) if parte)
    else:
        dados["{{DOTACAO}}"] = texto_dotacao
    for chave in (
        "{{CAMINHO_IMAGEM_DOTACAO}}", "{{CONTATOS_SECRETARIAS}}", "ITENS_NOMES",
        "PAGAMENTO_ETAPAS_RAW", "INSTRUCOES_EXTRAS", "REQUISITOS_ETP_ANTERIOR",
        "RAW_EXECUCAO", "RAW_MOTIVO_CRITERIO", "RAW_MOTIVO_MODALIDADE", "RAW_PAC",
    ):
        dados.pop(chave, None)

    def limpar(valor):
        if isinstance(valor, dict):
            return {str(chave): limpar(item) for chave, item in valor.items() if "base64" not in str(chave).casefold()}
        if isinstance(valor, list):
            return [limpar(item) for item in valor]
        if isinstance(valor, str):
            if valor.startswith("__IMG__") or valor.startswith("data:image/"):
                return "[imagem omitida do prompt]"
            return re.sub(r"(?:__IMG__|data:image/[^;]+;base64,)[A-Za-z0-9+/=]+", "[imagem omitida do prompt]", valor)
        return valor

    return limpar(dados)


def _substituir_contextos(texto: str, dados_usuario: dict, resultados: dict[str, dict]) -> str:
    dados_prompt = _dados_para_prompt(dados_usuario)
    substituicoes = {
        _PIPE_DATA: json.dumps(dados_prompt, ensure_ascii=False, indent=2),
        _PIPE_DFD: json.dumps(resultados.get("DFD", {}), ensure_ascii=False, indent=2),
        _PIPE_ETP: json.dumps(resultados.get("ETP", {}), ensure_ascii=False, indent=2),
        _PIPE_STAGES: json.dumps(resultados, ensure_ascii=False, indent=2),
    }
    for marcador, valor in substituicoes.items():
        texto = texto.replace(marcador, valor)
    return texto


def _extrair_json(texto: str) -> dict:
    texto = str(texto or "").strip()
    if not texto:
        raise RuntimeError("A IA retornou resposta vazia.")
    inicio = texto.find("{")
    fim = texto.rfind("}")
    if inicio != -1 and fim != -1:
        texto = texto[inicio:fim + 1]
    try:
        resultado = json.loads(texto)
    except json.JSONDecodeError:
        texto = re.sub(r",\s*([}\]])", r"\1", texto)
        try:
            resultado = json.loads(texto)
        except json.JSONDecodeError:
            corrigido = []
            em_string = False
            escapado = False
            for char in texto:
                if em_string:
                    if escapado:
                        escapado = False
                        corrigido.append(char)
                    elif char == "\\":
                        escapado = True
                        corrigido.append(char)
                    elif char == '"':
                        em_string = False
                        corrigido.append(char)
                    elif char == "\n":
                        corrigido.append("\\n")
                    elif char == "\r":
                        continue
                    elif char == "\t":
                        corrigido.append("\\t")
                    elif ord(char) >= 32:
                        corrigido.append(char)
                else:
                    corrigido.append(char)
                    if char == '"':
                        em_string = True
            texto = re.sub(r",\s*([}\]])", r"\1", "".join(corrigido))
            try:
                resultado = json.loads(texto)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"O texto gerado pela IA está corrompido: {exc}") from exc
    if not isinstance(resultado, dict):
        raise RuntimeError("A IA não retornou um objeto JSON.")
    return resultado


def _validar_json_geracao(resultado: dict) -> dict:
    if not resultado:
        raise RuntimeError("A IA retornou um objeto JSON vazio.")
    vazios = [chave for chave, valor in resultado.items() if isinstance(valor, str) and not valor.strip()]
    if vazios:
        raise RuntimeError(f"A IA retornou campos vazios: {', '.join(vazios)}")
    return {str(chave): valor for chave, valor in resultado.items()}


def _tokenizar(nome: str) -> list[str]:
    return re.sub(r"\s+", " ", str(nome or "").strip()).lower().split()


def _somente_remove_tokens(original: str, revisado: str) -> bool:
    origem = _tokenizar(original)
    destino = _tokenizar(revisado)
    if not origem or not destino:
        return False
    cursor = 0
    for token in destino:
        try:
            indice = origem.index(token, cursor)
        except ValueError:
            return False
        cursor = indice + 1
    return len(destino) < len(origem)


def _aplicar_auditoria_marcas(dados_usuario: dict, resposta: dict) -> tuple[dict, dict]:
    itens_json = dados_usuario.get("{{ITENS}}", "[]")
    if isinstance(itens_json, str):
        try:
            itens = json.loads(itens_json.replace("__TABLE__", "", 1))
        except json.JSONDecodeError:
            itens = []
    else:
        itens = itens_json if isinstance(itens_json, list) else []

    retorno = resposta.get("itens")
    if not isinstance(retorno, list):
        raise RuntimeError("A auditoria de marcas retornou um formato inválido.")

    por_numero = {str(item.get("numero")): item for item in retorno if isinstance(item, dict) and item.get("numero") is not None}
    itens_revisados = []
    auditoria = []
    for index, item in enumerate(itens):
        numero = item.get("numero", index + 1) if isinstance(item, dict) else index + 1
        original = re.sub(r"\s+", " ", str((item or {}).get("descricao", "")).strip()) if isinstance(item, dict) else ""
        candidato = por_numero.get(str(numero)) or {}
        proposto = re.sub(r"\s+", " ", str(candidato.get("nome_revisado", original)).strip())
        alterado = False
        motivo = "Nenhuma marca sem justificativa identificada."
        if proposto and proposto != original:
            if _somente_remove_tokens(original, proposto):
                alterado = True
                motivo = str(candidato.get("motivo") or "Marca sem justificativa identificada e removida.").strip()
            else:
                proposto = original
                motivo = "Alteração descartada porque ultrapassava a remoção isolada de marca."
        novo_item = dict(item) if isinstance(item, dict) else item
        if isinstance(novo_item, dict) and alterado:
            novo_item["descricao"] = proposto
        itens_revisados.append(novo_item)
        auditoria.append({
            "numero": numero,
            "nome_original": original,
            "nome_revisado": proposto or original,
            "alterado": alterado,
            "motivo": motivo,
        })

    novos_dados = dict(dados_usuario)
    novos_dados["{{ITENS}}"] = json.dumps(itens_revisados, ensure_ascii=False)
    novos_dados["ITENS_NOMES"] = json.dumps([
        {"numero": item.get("numero", index + 1), "nome": str(item.get("descricao", "")).strip()}
        for index, item in enumerate(itens_revisados)
        if isinstance(item, dict) and str(item.get("descricao", "")).strip()
    ], ensure_ascii=False)
    return novos_dados, {"itens": auditoria}


def _provider_config(model: str) -> tuple[str, str, str]:
    modelo = str(model or "unsloth-auto").strip()
    return API_UNSLOTH_URL, API_UNSLOTH_KEY, modelo


def _chamar_ia(prompt: str, model: str, temperature: float = 0.3) -> tuple[dict, str]:
    base_url, api_key, modelo = _provider_config(model)
    if not base_url or not api_key:
        raise RuntimeError("O provedor de IA da fila não está configurado no backend.")
    limite_prompt = max(40_000, min(118_000, int(os.getenv("LICITA_QUEUE_MAX_PROMPT_CHARS", "110000"))))
    if len(prompt) > limite_prompt:
        raise RuntimeError(
            f"O prompt excede o limite de contexto seguro ({len(prompt):,} caracteres; limite {limite_prompt:,}). "
            "Reduza a quantidade de texto dos dados ou dos documentos de referência."
        )
    max_tokens = max(1024, min(16_384, int(os.getenv("LICITA_QUEUE_MAX_TOKENS", "8192"))))
    payload = {
        "model": modelo,
        "temperature": float(temperature),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }
    # O Unsloth aplica o modo de raciocínio quando suportado pelo modelo/template ativo.
    # Enviar em todas as chamadas evita acoplar esse comportamento ao nome de uma família específica.
    payload["enable_thinking"] = True
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=AI_TIMEOUT_SECONDS) as client:
        response = client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    if response.status_code >= 400:
        raise RuntimeError(f"IA HTTP {response.status_code}: {response.text[:500]}")
    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("O provedor de IA retornou JSON inválido.") from exc
    choice = (data.get("choices") or [None])[0]
    content = ((choice or {}).get("message") or {}).get("content")
    if isinstance(content, list):
        content = "".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content)
    resultado = _extrair_json(str(content or ""))
    return resultado, str(data.get("model") or modelo)
