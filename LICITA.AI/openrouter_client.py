"""Cliente compartilhado do OpenRouter (https://openrouter.ai/docs).

Toda a geração de IA do LICITA.AI passa por este módulo: leitura da configuração por variáveis de
ambiente, cabeçalhos e montagem do payload de ``/chat/completions`` no formato do OpenRouter.
As variáveis são lidas a cada chamada, de modo que alterações no ambiente do serviço e testes que
usam ``patch.dict(os.environ, ...)`` tenham efeito imediato.

Variáveis (todas aceitam também o prefixo ``LICITA_``, que tem precedência):

- ``OPENROUTER_API_KEY``: chave de acesso (obrigatória).
- ``OPENROUTER_MODEL``: identificador do modelo, por exemplo ``provedor/modelo``. Padrão: ``openrouter/auto``.
- ``OPENROUTER_BASE_URL``: padrão ``https://openrouter.ai/api/v1``.
- ``OPENROUTER_SITE_URL`` e ``OPENROUTER_APP_TITLE``: atribuição do aplicativo (cabeçalhos HTTP-Referer e X-Title).
- ``OPENROUTER_REASONING_EFFORT``: ``minimal``, ``low``, ``medium`` (padrão), ``high``, ``xhigh`` ou ``off``
  (``off`` não envia o parâmetro ``reasoning``; use com modelos sem suporte a raciocínio).
- ``OPENROUTER_WEB_SEARCH``: ``1`` (padrão) ou ``0``. Liga a ferramenta de pesquisa na web nas etapas que a usam.
- ``OPENROUTER_WEB_MAX_RESULTS``, ``OPENROUTER_WEB_MAX_TOTAL_RESULTS``, ``OPENROUTER_WEB_ENGINE``: ajustes da busca.
- ``OPENROUTER_REQUIRE_PARAMETERS``: ``auto`` (padrão), ``true`` ou ``false``. Em ``auto`` só exige provedores que
  suportem todos os parâmetros quando a chamada usa ``response_format`` (schema JSON estrito).
- ``OPENROUTER_DATA_COLLECTION``: ``allow`` ou ``deny``. Em ``deny`` só usa provedores que não coletam dados.
- ``OPENROUTER_MAX_TOKENS``: teto opcional de tokens de saída (por padrão não é enviado).
"""

from __future__ import annotations

import json
import os

BASE_URL_PADRAO = "https://openrouter.ai/api/v1"
SITE_URL_PADRAO = "https://danihmorais.github.io"
TITULO_APP_PADRAO = "LICITA.AI"
MODELO_ROTEADOR_AUTOMATICO = "openrouter/auto"

# Nomes que significam "use o modelo configurado no backend". "unsloth-auto" é mantido apenas para
# reconhecer jobs que já estavam gravados na fila antes da migração para o OpenRouter.
ALIASES_MODELO_AUTOMATICO = frozenset({"", "auto", "openrouter-auto", "unsloth-auto"})
ESFORCOS_RACIOCINIO = frozenset({"minimal", "low", "medium", "high", "xhigh"})

_VALORES_FALSOS = frozenset({"0", "false", "no", "nao", "não", "off", "desligado"})


def _env(*nomes: str, padrao: str = "") -> str:
    for nome in nomes:
        valor = os.getenv(nome, "").strip()
        if valor:
            return valor
    return padrao


def _env_opcao(sufixo: str, padrao: str = "") -> str:
    return _env(f"LICITA_OPENROUTER_{sufixo}", f"OPENROUTER_{sufixo}", padrao=padrao)


def _env_inteiro(sufixo: str, padrao: int, minimo: int, maximo: int) -> int:
    try:
        valor = int(_env_opcao(sufixo, str(padrao)))
    except ValueError:
        valor = padrao
    return max(minimo, min(maximo, valor))


def api_key() -> str:
    return _env_opcao("API_KEY")


def base_url() -> str:
    return _env_opcao("BASE_URL", BASE_URL_PADRAO).rstrip("/")


def url_chat_completions() -> str:
    return f"{base_url()}/chat/completions"


def modelo_configurado() -> str:
    return _env_opcao("MODEL", MODELO_ROTEADOR_AUTOMATICO)


def configurado() -> bool:
    return bool(api_key() and base_url())


def modelo_automatico(modelo: str | None) -> bool:
    return str(modelo or "").strip().casefold() in ALIASES_MODELO_AUTOMATICO


def resolver_modelo(modelo: str | None) -> str:
    """Converte o alias automático no modelo configurado; identificadores explícitos são preservados."""
    texto = str(modelo or "").strip()
    return modelo_configurado() if modelo_automatico(texto) else texto


def modelo_para_fixar(solicitado: str, respondido: str | None) -> str:
    """Modelo que as próximas etapas do mesmo pedido devem reutilizar.

    Com o roteador automático, o OpenRouter informa qual modelo atendeu a chamada; fixá-lo mantém todas as
    etapas do pedido no mesmo modelo. Com um modelo explícito, o identificador configurado é mantido.
    """
    if solicitado == MODELO_ROTEADOR_AUTOMATICO and respondido:
        return str(respondido)
    return solicitado


def headers() -> dict[str, str]:
    cabecalhos = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key()}"}
    site = _env_opcao("SITE_URL", SITE_URL_PADRAO)
    titulo = _env_opcao("APP_TITLE", TITULO_APP_PADRAO)
    if site:
        cabecalhos["HTTP-Referer"] = site
    if titulo:
        cabecalhos["X-Title"] = titulo
    return cabecalhos


def _configuracao_raciocinio(habilitado: bool) -> dict | None:
    modo = _env_opcao("REASONING_EFFORT", "medium").casefold()
    if modo in {"off", "omit", "omitir"}:
        return None
    if not habilitado:
        return {"enabled": False}
    # exclude: o texto do raciocínio não é usado pela aplicação; evita trafegá-lo na resposta.
    return {"effort": modo if modo in ESFORCOS_RACIOCINIO else "medium", "exclude": True}


def _ferramenta_pesquisa_web() -> dict | None:
    if _env_opcao("WEB_SEARCH", "1").casefold() in _VALORES_FALSOS:
        return None
    parametros: dict = {
        "max_results": _env_inteiro("WEB_MAX_RESULTS", 5, 1, 25),
        "max_total_results": _env_inteiro("WEB_MAX_TOTAL_RESULTS", 20, 1, 100),
    }
    engine = _env_opcao("WEB_ENGINE")
    if engine:
        parametros["engine"] = engine
    return {"type": "openrouter:web_search", "parameters": parametros}


def _preferencias_provedor(possui_response_format: bool) -> dict:
    preferencias: dict = {}
    exigir = _env_opcao("REQUIRE_PARAMETERS", "auto").casefold()
    if exigir == "auto":
        # Sem isso um provedor pode ignorar o schema estrito em silêncio e devolver JSON fora do formato.
        exigir_parametros = possui_response_format
    else:
        exigir_parametros = exigir not in _VALORES_FALSOS
    if exigir_parametros:
        preferencias["require_parameters"] = True
    coleta = _env_opcao("DATA_COLLECTION").casefold()
    if coleta in {"allow", "deny"}:
        preferencias["data_collection"] = coleta
    return preferencias


def montar_payload(
    modelo: str | None,
    mensagens: list[dict],
    *,
    temperature: float,
    response_format: dict | None = None,
    enable_thinking: bool = True,
    enable_tools: bool = False,
) -> dict:
    """Monta o corpo de ``POST /chat/completions`` do OpenRouter.

    ``enable_thinking`` vira o objeto ``reasoning`` e ``enable_tools`` liga a ferramenta de servidor
    ``openrouter:web_search`` (o modelo decide quando e o que pesquisar).
    """
    payload: dict = {
        "model": resolver_modelo(modelo),
        "temperature": float(temperature),
        "messages": mensagens,
    }
    if response_format is not None:
        payload["response_format"] = response_format
    raciocinio = _configuracao_raciocinio(bool(enable_thinking))
    if raciocinio is not None:
        payload["reasoning"] = raciocinio
    if enable_tools:
        ferramenta = _ferramenta_pesquisa_web()
        if ferramenta is not None:
            payload["tools"] = [ferramenta]
    # Sem max_tokens por padrão: um teto arbitrário truncaria documentos longos.
    limite_saida = _env_inteiro("MAX_TOKENS", 0, 0, 1_000_000)
    if limite_saida:
        payload["max_tokens"] = limite_saida
    preferencias = _preferencias_provedor(response_format is not None)
    if preferencias:
        payload["provider"] = preferencias
    return payload


def detalhe_erro(corpo: object) -> str:
    """Extrai a mensagem de erro do formato ``{"error": {"message": ...}}`` do OpenRouter."""
    if isinstance(corpo, (bytes, bytearray)):
        corpo = bytes(corpo).decode("utf-8", "replace")
    bruto = corpo
    if isinstance(corpo, str):
        try:
            bruto = json.loads(corpo)
        except ValueError:
            return corpo.strip()
    if isinstance(bruto, dict):
        erro = bruto.get("error")
        if isinstance(erro, dict):
            mensagem = str(erro.get("message") or "").strip()
            metadados = erro.get("metadata")
            motivo = str(metadados.get("raw") or "").strip() if isinstance(metadados, dict) else ""
            return f"{mensagem} ({motivo})" if mensagem and motivo else (mensagem or json.dumps(erro, ensure_ascii=False))
        if isinstance(erro, str):
            return erro.strip()
    return str(corpo or "").strip()


_DICAS_HTTP = {
    401: "Chave do OpenRouter ausente ou inválida; confira OPENROUTER_API_KEY.",
    402: "Créditos insuficientes na conta do OpenRouter.",
    403: "Requisição recusada pelo OpenRouter (moderação do conteúdo ou restrição da chave).",
    404: (
        "Nenhum provedor do OpenRouter atende ao modelo e aos parâmetros da chamada (response_format, reasoning, "
        "tools); confira OPENROUTER_MODEL e, se preciso, OPENROUTER_REQUIRE_PARAMETERS e OPENROUTER_REASONING_EFFORT."
    ),
}


def descrever_erro_http(status: int, corpo: object) -> str:
    detalhe = detalhe_erro(corpo)[:500]
    dica = _DICAS_HTTP.get(status)
    base = f"IA HTTP {status}: {detalhe}" if detalhe else f"IA HTTP {status}"
    return f"{base} {dica}" if dica else base


def erro_embutido(dados: object) -> tuple[int, str] | None:
    """Detecta erro do provedor devolvido com HTTP 200 (sem ``choices``); retorna (código, detalhe)."""
    if not isinstance(dados, dict) or dados.get("choices") or not isinstance(dados.get("error"), dict):
        return None
    codigo = dados["error"].get("code")
    status = int(codigo) if isinstance(codigo, int) and not isinstance(codigo, bool) else 502
    return status, detalhe_erro(dados)
