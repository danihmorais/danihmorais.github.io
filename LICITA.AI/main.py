from __future__ import annotations

import os
import threading
import time
from collections import deque

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
    allow_headers=["Content-Type"],
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

iniciar_worker()
threading.Thread(target=_limpar_fila_antiga, name="licita-retencao", daemon=True).start()
