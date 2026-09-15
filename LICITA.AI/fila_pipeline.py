from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from fila import (
    MAX_ATTEMPTS,
    POLL_INTERVAL_SECONDS,
    QUEUE_DIR,
    RETRY_BASE_SECONDS,
    RETRY_MAX_SECONDS,
    _artifact_path,
    _claim_next_job,
    _enviar_email,
    _job_path,
    _write_json,
    gerar_zip,
)

API_OPENROUTER_URL = os.getenv("LICITA_OPENROUTER_URL", "https://openrouter.ai/api/v1").rstrip("/")
API_OPENROUTER_KEY = os.getenv("LICITA_OPENROUTER_KEY", os.getenv("API_OPENROUTER", "")).strip()
API_UNSLOTH_URL = os.getenv("LICITA_UNSLOTH_URL", os.getenv("UNSLOTH_URL", "http://127.0.0.1:8888/v1")).rstrip("/")
API_UNSLOTH_KEY = os.getenv("LICITA_UNSLOTH_KEY", os.getenv("API_UNSLOTH", "")).strip()
AI_TIMEOUT_SECONDS = max(60, int(os.getenv("LICITA_QUEUE_AI_TIMEOUT", "600")))

_PIPE_DFD = "__LICITA_PIPE_DFD__"
_PIPE_ETP = "__LICITA_PIPE_ETP__"
_PIPE_DATA = "__LICITA_PIPE_DADOS_USUARIO__"
_PIPE_STAGES = "__LICITA_PIPE_ETAPAS__"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _substituir_contextos(texto: str, dados_usuario: dict, resultados: dict[str, dict]) -> str:
    substituicoes = {
        _PIPE_DATA: json.dumps(dados_usuario, ensure_ascii=False, indent=2),
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
    modelo = str(model or "openrouter/free").strip()
    if modelo == "unsloth-auto" or modelo.startswith("unsloth"):
        return API_UNSLOTH_URL, API_UNSLOTH_KEY, modelo
    return API_OPENROUTER_URL, API_OPENROUTER_KEY, modelo


def _chamar_ia(prompt: str, model: str, temperature: float = 0.3) -> tuple[dict, str]:
    base_url, api_key, modelo = _provider_config(model)
    if not base_url or not api_key:
        raise RuntimeError("O provedor de IA da fila não está configurado no backend.")
    payload = {
        "model": modelo,
        "temperature": float(temperature),
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }
    if "gemma-4" in modelo.lower() and (modelo == "unsloth-auto" or modelo.startswith("unsloth") or "127.0.0.1" in base_url or "localhost" in base_url):
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


def _delay(attempts: int) -> int:
    return min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * (2 ** max(0, attempts - 1)))


def _process_pipeline(job: dict) -> None:
    dados_ia_container = job.get("dados_ia") if isinstance(job.get("dados_ia"), dict) else {}
    pipeline = dados_ia_container.get("__LICITA_PIPELINE__")
    if not isinstance(pipeline, dict):
        raise RuntimeError("Solicitação sem pipeline de IA assíncrona; recrie a solicitação.")

    etapas = pipeline.get("etapas")
    if not isinstance(etapas, list) or not etapas:
        raise RuntimeError("A solicitação não possui etapas de IA válidas.")

    dados_usuario = dict(job.get("pipeline_dados_usuario") or job.get("dados_usuario") or {})
    resultados = dict(job.get("pipeline_results") or {})
    completed = {str(item).upper() for item in job.get("completed_stages", [])}
    modelo = str(job.get("resolved_model") or pipeline.get("model") or "openrouter/free")
    temperatura = float(pipeline.get("temperature", 0.3))

    for etapa in etapas:
        etapa_id = str(etapa.get("id", "")).strip().upper()
        etapa_tipo = str(etapa.get("tipo", "geracao_json"))
        prompt = str(etapa.get("prompt", ""))
        if not etapa_id or not prompt:
            raise RuntimeError("Há uma etapa de IA incompleta na fila.")
        if etapa_id in completed and etapa_id in resultados:
            continue

        job["current_stage"] = etapa_id
        job["current_stage_started_at"] = _utc_now()
        job["status"] = "processing"
        _write_json(_job_path(job["job_id"], ".processing"), job)

        prompt_processado = _substituir_contextos(prompt, dados_usuario, resultados)
        resultado, modelo_resolvido = _chamar_ia(prompt_processado, modelo, temperatura)
        if pipeline.get("model") == "openrouter/free" and modelo_resolvido:
            modelo = modelo_resolvido
            job["resolved_model"] = modelo_resolvido

        if etapa_tipo == "auditoria_marcas":
            dados_usuario, resultado_final = _aplicar_auditoria_marcas(dados_usuario, resultado)
            resultados[etapa_id] = resultado_final
        else:
            resultados[etapa_id] = _validar_json_geracao(resultado)

        completed.add(etapa_id)
        job["pipeline_results"] = resultados
        job["pipeline_dados_usuario"] = dados_usuario
        job["completed_stages"] = sorted(completed)
        _write_json(_job_path(job["job_id"], ".processing"), job)

    dados_ia_final: dict = {}
    for etapa_id, resultado in resultados.items():
        if etapa_id == "AUDITORIA_MARCAS" or not isinstance(resultado, dict):
            continue
        dados_ia_final.update(resultado)

    generated_path, zip_filename = gerar_zip(dados_usuario, dados_ia_final, job["job_id"])
    temp_root = generated_path.parent
    artifact_path = _artifact_path(job["job_id"])
    try:
        artifact_path.unlink(missing_ok=True)
        os.replace(generated_path, artifact_path)
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    job["dados_usuario_processados"] = dados_usuario
    job["dados_ia"] = dados_ia_final
    job["current_stage"] = "ENVIO_EMAIL"
    job["email_started_at"] = _utc_now()
    _write_json(_job_path(job["job_id"], ".processing"), job)

    _enviar_email(job["email"], artifact_path, zip_filename, job["job_id"])

    done_path = _job_path(job["job_id"], ".done")
    job.update({
        "status": "sent",
        "completed_at": _utc_now(),
        "current_stage": "CONCLUIDO",
        "result": {"filename": zip_filename, "recipient": job["email"]},
    })
    _write_json(done_path, job)
    artifact_path.unlink(missing_ok=True)
    _job_path(job["job_id"], ".processing").unlink(missing_ok=True)


def _process_one_job() -> None:
    claimed = _claim_next_job()
    if claimed is None:
        return
    processing_path, job = claimed
    try:
        pipeline = (job.get("dados_ia") or {}).get("__LICITA_PIPELINE__")
        if not isinstance(pipeline, dict):
            raise RuntimeError("Solicitação sem pipeline de IA assíncrona; recrie a solicitação.")
        _process_pipeline(job)
    except Exception as exc:
        attempts = int(job.get("attempts", 1))
        job["last_error"] = str(exc)
        job["last_error_at"] = _utc_now()
        job["current_stage"] = job.get("current_stage") or "PROCESSAMENTO"
        if attempts < MAX_ATTEMPTS:
            job["status"] = "queued"
            job["retry_at"] = (datetime.now(timezone.utc) + timedelta(seconds=_delay(attempts))).isoformat()
            _write_json(_job_path(job["job_id"]), job)
            processing_path.unlink(missing_ok=True)
        else:
            job["status"] = "failed"
            job.pop("retry_at", None)
            _write_json(_job_path(job["job_id"], ".failed"), job)
            processing_path.unlink(missing_ok=True)
            _artifact_path(job["job_id"]).unlink(missing_ok=True)


def _worker_loop() -> None:
    while True:
        try:
            _process_one_job()
        except Exception:
            pass
        time.sleep(POLL_INTERVAL_SECONDS)


_worker_thread: threading.Thread | None = None


def iniciar_worker() -> None:
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    _worker_thread = threading.Thread(target=_worker_loop, name="licita-ai-pipeline", daemon=True)
    _worker_thread.start()
