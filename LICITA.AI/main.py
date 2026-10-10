from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.datastructures import UploadFile

from documentos_contexto import MAX_CONTEXT_CHARS, extrair_contexto_documentos
from fila import EMAIL_RE, QUEUE_DIR, enqueue_job, get_job
from fila_pipeline_unificado import iniciar_worker

app = FastAPI(title="Licita.AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://danihmorais.github.io"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


class FasePreparatoriaRequest(BaseModel):
    email: str
    instrucoes: str = ""
    dados_ia: dict = Field(default_factory=dict)
    dados_usuario: dict = Field(default_factory=dict)


class IAChatRequest(BaseModel):
    model: str = Field(default="unsloth-auto", min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=120_000)
    temperature: float = Field(default=0.3, ge=0, le=1.5)
    response_format: dict | None = None


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


API_UNSLOTH_URL = os.getenv("LICITA_UNSLOTH_URL", os.getenv("UNSLOTH_URL", "http://127.0.0.1:8888/v1")).rstrip("/")
MAX_UPLOAD_BYTES = max(1_000_000, int(os.getenv("LICITA_DOCUMENT_MAX_BYTES", str(15 * 1024 * 1024))))
UPLOAD_FIELDS = ("dfd", "etp", "tr", "edital")
API_UNSLOTH_KEY = os.getenv("LICITA_UNSLOTH_KEY", os.getenv("API_UNSLOTH", "")).strip()

IA_RATE_WINDOW_SECONDS = max(10, int(os.getenv("LICITA_IA_RATE_WINDOW", "60")))
IA_RATE_LIMIT = max(1, int(os.getenv("LICITA_IA_RATE_LIMIT", "20")))
_ia_rate_lock = threading.Lock()
_ia_rate_buckets: dict[str, deque[float]] = {}
QUEUE_RATE_WINDOW_SECONDS = max(60, int(os.getenv("LICITA_QUEUE_RATE_WINDOW", "600")))
QUEUE_RATE_LIMIT = max(1, int(os.getenv("LICITA_QUEUE_RATE_LIMIT", "5")))
QUEUE_EMAIL_RATE_WINDOW_SECONDS = max(300, int(os.getenv("LICITA_QUEUE_EMAIL_RATE_WINDOW", "3600")))
QUEUE_EMAIL_RATE_LIMIT = max(1, int(os.getenv("LICITA_QUEUE_EMAIL_RATE_LIMIT", "3")))
_queue_rate_lock = threading.Lock()
_queue_ip_rate_buckets: dict[str, deque[float]] = {}
_queue_email_rate_buckets: dict[str, deque[float]] = {}

# O painel administrativo fica desativado até que a senha seja configurada no ambiente do servidor.
ADMIN_PASSWORD = os.getenv("LICITA_ADMIN_PASSWORD", "")
ADMIN_SESSION_TTL_SECONDS = max(300, int(os.getenv("LICITA_ADMIN_SESSION_TTL", "1800")))
ADMIN_LOGIN_RATE_WINDOW_SECONDS = max(60, int(os.getenv("LICITA_ADMIN_LOGIN_RATE_WINDOW", "900")))
ADMIN_LOGIN_RATE_LIMIT = max(1, int(os.getenv("LICITA_ADMIN_LOGIN_RATE_LIMIT", "8")))
_admin_login_rate_buckets: dict[str, deque[float]] = {}
_admin_login_rate_lock = threading.Lock()


def _client_identity(request: Request) -> str:
    client = request.client
    return client.host if client and client.host else "unknown"


def _check_rate_limit(buckets: dict[str, deque[float]], lock: threading.Lock, identity: str, limit: int, window_seconds: int, detail: str) -> None:
    now = time.monotonic()
    with lock:
        bucket = buckets.setdefault(identity, deque())
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(window_seconds)})
        bucket.append(now)
        if len(buckets) > 10_000:
            for key in list(buckets)[:1_000]:
                if not buckets[key]:
                    buckets.pop(key, None)


def _check_ia_rate_limit(request: Request) -> None:
    _check_rate_limit(_ia_rate_buckets, _ia_rate_lock, _client_identity(request), IA_RATE_LIMIT, IA_RATE_WINDOW_SECONDS, "Limite de requisições de IA excedido. Tente novamente em instantes.")


def _check_queue_rate_limit(request: Request, email: str) -> None:
    _check_rate_limit(_queue_ip_rate_buckets, _queue_rate_lock, _client_identity(request), QUEUE_RATE_LIMIT, QUEUE_RATE_WINDOW_SECONDS, "Limite de solicitações de geração excedido. Tente novamente mais tarde.")
    _check_rate_limit(_queue_email_rate_buckets, _queue_rate_lock, email.casefold(), QUEUE_EMAIL_RATE_LIMIT, QUEUE_EMAIL_RATE_WINDOW_SECONDS, "Este e-mail atingiu o limite de solicitações. Tente novamente mais tarde.")


async def _upstream_chat(base_url: str, api_key: str, payload: dict) -> tuple[dict, int]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    if response.status_code >= 400:
        return {}, response.status_code
    try:
        return response.json(), response.status_code
    except ValueError:
        return {}, 502


async def _gerar_ia(req: IAChatRequest) -> dict:
    if not API_UNSLOTH_URL or not API_UNSLOTH_KEY:
        raise HTTPException(status_code=503, detail="Unsloth local não está configurado no backend.")

    payload = {
        "model": req.model,
        "temperature": float(req.temperature),
        "enable_thinking": True,
        "messages": [{"role": "user", "content": req.prompt.strip()}],
    }
    if req.response_format is not None:
        payload["response_format"] = req.response_format

    data, status = await _upstream_chat(API_UNSLOTH_URL, API_UNSLOTH_KEY, payload)
    if status >= 400:
        if status == 429:
            raise HTTPException(status_code=429, detail="O Unsloth local está limitando as requisições no momento.")
        raise HTTPException(status_code=502, detail=f"O Unsloth local retornou HTTP {status}.")

    choice = (data.get("choices") or [None])[0]
    content = ((choice or {}).get("message") or {}).get("content")
    model = data.get("model") or req.model
    if not content:
        raise HTTPException(status_code=502, detail="O Unsloth local retornou uma resposta vazia.")
    return {"content": content, "model": model, "provider": "unsloth"}


@app.get("/api/ia/status")
async def status_ia():
    return {"ok": bool(API_UNSLOTH_URL and API_UNSLOTH_KEY), "unsloth": bool(API_UNSLOTH_URL and API_UNSLOTH_KEY)}


@app.post("/api/ia/chat")
async def chat_ia(request: Request, req: IAChatRequest):
    if not req.prompt.strip():
        raise HTTPException(status_code=422, detail="O campo prompt não pode ficar vazio.")
    _check_ia_rate_limit(request)
    return await _gerar_ia(req)


def _queue_items() -> list[dict]:
    if not QUEUE_DIR.exists():
        return []
    items: list[dict] = []
    for path in QUEUE_DIR.glob("[0-9a-f]*.json"):
        if path.name.endswith((".done.json", ".failed.json")):
            continue
        try:
            job = __import__("json").loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(job, dict) and isinstance(job.get("job_id"), str) and job.get("created_at"):
            items.append({"job_id": job["job_id"], "created_at": str(job["created_at"]), "status": job.get("status", "queued")})
    return sorted(items, key=lambda item: item["created_at"])


def _queue_position(job_id: str) -> tuple[int | None, int | None]:
    for index, item in enumerate(_queue_items()):
        if item["job_id"].lower() == job_id.lower():
            return index + 1, index
    return None, None


async def _ler_payload_fase_preparatoria(request: Request) -> tuple[FasePreparatoriaRequest, dict | None]:
    content_type = request.headers.get("content-type", "").lower()

    if "multipart/form-data" not in content_type:
        try:
            payload = await request.json()
            return FasePreparatoriaRequest.model_validate(payload), None
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="Payload JSON inválido.") from exc

    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Não foi possível ler os arquivos enviados: {exc}") from exc

    payload_bruto = form.get("payload")
    if not isinstance(payload_bruto, str):
        raise HTTPException(status_code=400, detail="O campo payload é obrigatório no envio multipart.")

    try:
        req = FasePreparatoriaRequest.model_validate(__import__("json").loads(payload_bruto))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Payload JSON inválido no envio multipart.") from exc

    arquivos: dict[str, tuple[str, bytes] | None] = {campo: None for campo in UPLOAD_FIELDS}
    houve_upload = False
    for campo in UPLOAD_FIELDS:
        upload = form.get(campo)
        if upload is None:
            continue
        if not isinstance(upload, UploadFile):
            raise HTTPException(status_code=400, detail=f"O campo de arquivo '{campo}' é inválido.")
        nome = str(upload.filename or "").strip()
        if not nome:
            raise HTTPException(status_code=400, detail=f"O arquivo do campo '{campo}' não possui nome.")
        conteudo = await upload.read(MAX_UPLOAD_BYTES + 1)
        if len(conteudo) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"O arquivo '{nome}' excede o limite de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )
        arquivos[campo] = (nome, conteudo)
        houve_upload = True

    if not houve_upload:
        return req, None

    try:
        contexto = extrair_contexto_documentos(arquivos)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Não foi possível processar os documentos de referência: {exc}") from exc

    pipeline = req.dados_ia.get("__LICITA_PIPELINE__") if isinstance(req.dados_ia, dict) else None
    if not isinstance(pipeline, dict):
        raise HTTPException(status_code=400, detail="Não foi possível associar os documentos de referência ao pipeline de IA.")

    dados_ia = dict(req.dados_ia)
    pipeline_atualizado = dict(pipeline)
    pipeline_atualizado["documentos_anteriores"] = contexto["documentos"]
    dados_ia["__LICITA_PIPELINE__"] = pipeline_atualizado

    req = req.model_copy(update={"dados_ia": dados_ia})
    resumo = {
        "quantidade": contexto["quantidade"],
        "total_caracteres": min(contexto["total_caracteres"], MAX_CONTEXT_CHARS),
        "documentos": [
            {"tipo": item["tipo"], "nome": item["nome"], "origem": item["origem"]}
            for item in contexto["documentos"]
        ],
    }
    return req, resumo


@app.post("/api/gerar-fase-preparatoria")
async def agendar_fase_preparatoria(request: Request):
    req, contexto_resumo = await _ler_payload_fase_preparatoria(request)
    email = req.email.strip()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=400, detail="Informe um e-mail válido para receber os documentos.")

    _check_queue_rate_limit(request, email)

    try:
        job = enqueue_job(
            email=email,
            dados_usuario=req.dados_usuario,
            dados_ia=req.dados_ia,
            instrucoes=req.instrucoes,
        )
        position, ahead = _queue_position(job["job_id"])
        job["fila_posicao"] = position
        job["solicitacoes_a_frente"] = ahead
        if contexto_resumo:
            job["documentos_referencia"] = contexto_resumo
        job["message"] = (
            f"Solicitação registrada na fila. Posição aproximada: {position}º. Os documentos serão enviados para {email} após o processamento."
            if position is not None
            else "Solicitação registrada na fila. Os documentos serão enviados por e-mail após o processamento."
        )
        return job
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível agendar a solicitação: {exc}") from exc


@app.get("/api/fila/{job_id}")
async def consultar_fila(job_id: str, token: str | None = None):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    stored_token = str(job.get("status_token", ""))
    if not stored_token or not token:
        raise HTTPException(status_code=401, detail="Token de consulta não informado.")

    import hmac
    if not hmac.compare_digest(stored_token, token):
        raise HTTPException(status_code=403, detail="Token de consulta inválido.")

    return {
        "job_id": job.get("job_id", job_id),
        "status": job.get("status", "unknown"),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "attempts": job.get("attempts", 0),
        "current_stage": job.get("current_stage"),
        "completed_stages": job.get("completed_stages", []),
        "last_error": job.get("last_error"),
        "result": job.get("result"),
    }



def _admin_token_secret() -> str:
    return os.getenv("LICITA_ADMIN_TOKEN_SECRET", "") or ADMIN_PASSWORD


def _criar_token_admin() -> str:
    secret = _admin_token_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Painel administrativo não configurado no servidor.")
    expira = int(time.time()) + ADMIN_SESSION_TTL_SECONDS
    payload = f"{expira}.{secrets.token_urlsafe(18)}"
    assinatura = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    assinatura_b64 = base64.urlsafe_b64encode(assinatura).decode("ascii").rstrip("=")
    return f"{payload}.{assinatura_b64}"


def _validar_token_admin(token: str) -> bool:
    secret = _admin_token_secret()
    if not secret or not token:
        return False
    partes = token.split(".")
    if len(partes) != 3:
        return False
    expira_texto, nonce, assinatura_recebida = partes
    if not expira_texto.isdigit() or not nonce or not assinatura_recebida:
        return False
    expira = int(expira_texto)
    agora = int(time.time())
    if expira <= agora or expira > agora + ADMIN_SESSION_TTL_SECONDS + 60:
        return False
    payload = f"{expira_texto}.{nonce}"
    assinatura = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    esperada = base64.urlsafe_b64encode(assinatura).decode("ascii").rstrip("=")
    return hmac.compare_digest(esperada, assinatura_recebida)


def _exigir_admin(request: Request) -> None:
    if not ADMIN_PASSWORD.strip() or not _admin_token_secret():
        raise HTTPException(status_code=503, detail="Painel administrativo não configurado no servidor.")
    esquema, _, token = request.headers.get("authorization", "").partition(" ")
    if esquema.lower() != "bearer" or not _validar_token_admin(token.strip()):
        raise HTTPException(status_code=401, detail="Sessão administrativa inválida ou expirada.")


def _parse_data_admin(valor) -> datetime | None:
    if not valor:
        return None
    try:
        texto = str(valor).strip().replace("Z", "+00:00")
        data = datetime.fromisoformat(texto)
        if data.tzinfo is None:
            data = data.replace(tzinfo=timezone.utc)
        return data.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _segundos_entre_admin(inicio, fim) -> int | None:
    a = _parse_data_admin(inicio)
    b = _parse_data_admin(fim)
    if a is None or b is None:
        return None
    return max(0, int((b - a).total_seconds()))


def _sanitizar_dados_admin(valor, chave: str = ""):
    if isinstance(valor, dict):
        return {str(k): _sanitizar_dados_admin(v, str(k)) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_sanitizar_dados_admin(item, chave) for item in valor]
    if isinstance(valor, str):
        chave_lower = chave.casefold()
        texto = valor.strip()
        if "base64" in chave_lower or texto.startswith("data:image/") or (
            "imagem" in chave_lower and len(valor) > 1200
        ):
            return "[conteúdo de imagem omitido do painel]"
        if len(valor) > 2500:
            return valor[:2500] + "… [conteúdo abreviado]"
    return valor


def _resumo_job_admin(job: dict, incluir_detalhes: bool = False) -> dict:
    job_id = str(job.get("job_id", ""))
    status = str(job.get("status", "desconhecido"))
    criado = job.get("created_at")
    finalizado = job.get("completed_at") or job.get("last_error_at")
    if status in {"queued", "processing"} or not finalizado:
        finalizado_para_tempo = datetime.now(timezone.utc).isoformat()
    else:
        finalizado_para_tempo = finalizado

    dados_usuario = job.get("dados_usuario")
    if not isinstance(dados_usuario, dict):
        dados_usuario = {}
    dados_processados = job.get("dados_usuario_processados")
    if not isinstance(dados_processados, dict):
        dados_processados = job.get("pipeline_dados_usuario")
    if not isinstance(dados_processados, dict):
        dados_processados = {}
    objeto = (
        dados_usuario.get("{{OBJETO}}")
        or dados_usuario.get("OBJETO")
        or dados_processados.get("{{OBJETO}}")
        or dados_processados.get("OBJETO")
        or "Objeto não informado"
    )
    tentativas = job.get("attempt_history")
    if not isinstance(tentativas, list):
        tentativas = []
    historico_etapas = job.get("stage_history")
    if not isinstance(historico_etapas, list):
        historico_etapas = []
    processamento = sum(
        max(0, int(item.get("duration_seconds", 0) or 0))
        for item in tentativas
        if isinstance(item, dict)
    )
    if not tentativas:
        processamento = _segundos_entre_admin(job.get("started_at"), finalizado_para_tempo) or 0
    else:
        for item in tentativas:
            if isinstance(item, dict) and item.get("status") == "processing" and not item.get("ended_at"):
                processamento += _segundos_entre_admin(item.get("started_at"), datetime.now(timezone.utc).isoformat()) or 0

    resumo = {
        "job_id": job_id,
        "status": status,
        "email": str(job.get("email") or ""),
        "objeto": str(objeto)[:500],
        "created_at": criado,
        "started_at": job.get("started_at"),
        "last_attempt_started_at": job.get("last_attempt_started_at"),
        "completed_at": job.get("completed_at"),
        "last_error_at": job.get("last_error_at"),
        "current_stage": job.get("current_stage"),
        "attempts": int(job.get("attempts", 0) or 0),
        "resolved_model": job.get("resolved_model"),
        "completed_stages": job.get("completed_stages", []),
        "retry_at": job.get("retry_at"),
        "retry_of": job.get("retry_of"),
        "last_error": str(job.get("last_error") or "")[:4000],
        "result": job.get("result"),
        "failure_notification": job.get("failure_notification"),
        "attempt_history": tentativas,
        "stage_history": historico_etapas,
        "queue_wait_seconds": _segundos_entre_admin(criado, job.get("started_at")),
        "processing_seconds": processamento,
        "elapsed_seconds": _segundos_entre_admin(criado, finalizado_para_tempo),
    }
    if incluir_detalhes:
        resumo["instrucoes"] = str(job.get("instrucoes") or "")[:8000]
        resumo["dados_usuario"] = _sanitizar_dados_admin(dados_usuario)
        resumo["dados_usuario_processados"] = _sanitizar_dados_admin(dados_processados)
        container = job.get("dados_ia")
        pipeline = container.get("__LICITA_PIPELINE__") if isinstance(container, dict) else None
        resumo["etapas_planejadas"] = [
            str(etapa.get("id", ""))
            for etapa in (pipeline.get("etapas", []) if isinstance(pipeline, dict) else [])
            if isinstance(etapa, dict)
        ]
    return resumo


def _listar_jobs_admin() -> list[dict]:
    if not QUEUE_DIR.exists():
        return []
    registros: dict[str, tuple[float, dict]] = {}
    sufixos = (".processing", ".done", ".failed")
    for caminho in QUEUE_DIR.glob("[0-9a-f]*.json"):
        nome = caminho.name[:-5] if caminho.name.endswith(".json") else caminho.name
        for sufixo in sufixos:
            if nome.endswith(sufixo):
                nome = nome[:-len(sufixo)]
                break
        if not re.fullmatch(r"[0-9a-f]{32}", nome, re.IGNORECASE):
            continue
        try:
            job = __import__("json").loads(caminho.read_text(encoding="utf-8"))
            if not isinstance(job, dict) or str(job.get("job_id", "")).lower() != nome.lower():
                continue
            mtime = caminho.stat().st_mtime
        except (OSError, ValueError):
            continue
        anterior = registros.get(nome.lower())
        if anterior is None or mtime >= anterior[0]:
            registros[nome.lower()] = (mtime, job)
    return [registro[1] for registro in registros.values()]


@app.post("/api/admin/login")
async def login_admin(request: Request, req: AdminLoginRequest):
    if not ADMIN_PASSWORD.strip() or not _admin_token_secret():
        raise HTTPException(status_code=503, detail="Painel administrativo não configurado no servidor.")
    _check_rate_limit(
        _admin_login_rate_buckets,
        _admin_login_rate_lock,
        _client_identity(request),
        ADMIN_LOGIN_RATE_LIMIT,
        ADMIN_LOGIN_RATE_WINDOW_SECONDS,
        "Muitas tentativas de acesso ao painel. Aguarde antes de tentar novamente.",
    )
    if not hmac.compare_digest(req.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Senha administrativa incorreta.")
    return {"token": _criar_token_admin(), "expires_in": ADMIN_SESSION_TTL_SECONDS}


@app.get("/api/admin/jobs")
async def listar_pedidos_admin(
    request: Request,
    status: str | None = None,
    q: str | None = None,
    limit: int = 200,
):
    _exigir_admin(request)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="O limite deve ficar entre 1 e 500.")
    status_filtro = (status or "todos").strip().lower()
    status_validos = {"todos", "queued", "processing", "sent", "failed"}
    if status_filtro not in status_validos:
        raise HTTPException(status_code=400, detail="Filtro de status inválido.")
    termo = (q or "").strip().casefold()
    jobs = _listar_jobs_admin()
    if status_filtro != "todos":
        jobs = [job for job in jobs if str(job.get("status", "")).casefold() == status_filtro]
    if termo:
        def corresponde(job: dict) -> bool:
            dados = job.get("dados_usuario") if isinstance(job.get("dados_usuario"), dict) else {}
            processados = job.get("dados_usuario_processados") or job.get("pipeline_dados_usuario") or {}
            if not isinstance(processados, dict):
                processados = {}
            objeto = dados.get("{{OBJETO}}") or dados.get("OBJETO") or processados.get("{{OBJETO}}") or processados.get("OBJETO") or ""
            return termo in " ".join((
                str(job.get("job_id", "")),
                str(job.get("email", "")),
                str(objeto),
                str(job.get("current_stage", "")),
                str(job.get("last_error", "")),
            )).casefold()
        jobs = [job for job in jobs if corresponde(job)]
    jobs.sort(key=lambda job: str(job.get("created_at") or ""), reverse=True)
    total = len(jobs)
    return {
        "items": [_resumo_job_admin(job) for job in jobs[:limit]],
        "total": total,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/admin/jobs/{job_id}")
async def detalhar_pedido_admin(job_id: str, request: Request):
    _exigir_admin(request)
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada ou já removida pela retenção.")
    return _resumo_job_admin(job, incluir_detalhes=True)


@app.post("/api/admin/jobs/{job_id}/retry")
async def refazer_pedido_admin(job_id: str, request: Request):
    _exigir_admin(request)
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada ou já removida pela retenção.")
    if str(job.get("status", "")).lower() != "failed":
        raise HTTPException(status_code=409, detail="Só é possível refazer solicitações marcadas como falha.")

    email = str(job.get("email") or "").strip()
    dados_usuario = job.get("dados_usuario")
    dados_ia = job.get("dados_ia")
    if not isinstance(dados_usuario, dict):
        dados_usuario = {}
    if not isinstance(dados_ia, dict):
        dados_ia = {}

    pipeline = dados_ia.get("__LICITA_PIPELINE__")
    retry_mode = None
    dados_processados = job.get("dados_usuario_processados")
    if not (isinstance(pipeline, dict) and isinstance(pipeline.get("etapas"), list) and pipeline.get("etapas")):
        # Compatibilidade com falhas antigas no envio SMTP: os documentos já haviam sido gerados.
        if (
            str(job.get("current_stage", "")).upper() == "ENVIO_EMAIL"
            and isinstance(dados_processados, dict)
            and dados_ia
        ):
            retry_mode = "email_only"
        else:
            raise HTTPException(
                status_code=409,
                detail="Este registro antigo não contém os dados necessários para refazer a geração. Envie uma nova solicitação pelo formulário.",
            )

    try:
        novo = enqueue_job(
            email=email,
            dados_usuario=dados_usuario,
            dados_ia=dados_ia,
            instrucoes=str(job.get("instrucoes") or ""),
            retry_of=job_id,
            retry_mode=retry_mode,
            dados_usuario_processados=dados_processados if retry_mode == "email_only" else None,
        )
        novo["retry_of"] = job_id
        return novo
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc



RETENTION_DAYS = max(1, int(os.getenv("LICITA_QUEUE_RETENTION_DAYS", "7")))


def _limpar_fila_antiga() -> None:
    cutoff = time.time() - RETENTION_DAYS * 86400
    while True:
        try:
            if QUEUE_DIR.exists():
                for path in QUEUE_DIR.iterdir():
                    if path.suffix not in {".json", ".zip"}:
                        continue
                    if path.name.endswith(".processing.json"):
                        continue
                    try:
                        if path.stat().st_mtime < cutoff:
                            path.unlink()
                    except OSError:
                        pass
        except OSError:
            pass
        time.sleep(86400)


iniciar_worker()
threading.Thread(target=_limpar_fila_antiga, name="licita-retencao", daemon=True).start()
