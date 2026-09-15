from __future__ import annotations

import os
import threading
import time
from collections import deque

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fila import EMAIL_RE, QUEUE_DIR, enqueue_job, get_job
from fila_pipeline import iniciar_worker

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
    model: str = Field(default="openrouter/free", min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=120_000)
    temperature: float = Field(default=0.3, ge=0, le=1.5)
    response_format: dict | None = None


API_UNSLOTH_URL = os.getenv(
    "LICITA_UNSLOTH_URL",
    os.getenv("UNSLOTH_URL", "http://127.0.0.1:8888/v1"),
).rstrip("/")
API_UNSLOTH_KEY = os.getenv("LICITA_UNSLOTH_KEY", os.getenv("API_UNSLOTH", "")).strip()
API_OPENROUTER_URL = os.getenv(
    "LICITA_OPENROUTER_URL", "https://openrouter.ai/api/v1"
).rstrip("/")
API_OPENROUTER_KEY = os.getenv(
    "LICITA_OPENROUTER_KEY", os.getenv("API_OPENROUTER", "")
).strip()

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


def _check_rate_limit(
    buckets: dict[str, deque[float]],
    lock: threading.Lock,
    identity: str,
    limit: int,
    window_seconds: int,
    detail: str,
) -> None:
    now = time.monotonic()
    with lock:
        bucket = buckets.setdefault(identity, deque())
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail=detail,
                headers={"Retry-After": str(window_seconds)},
            )
        bucket.append(now)
        if len(buckets) > 10_000:
            for key in list(buckets)[:1_000]:
                if not buckets[key]:
                    buckets.pop(key, None)


def _check_ia_rate_limit(request: Request) -> None:
    _check_rate_limit(
        _ia_rate_buckets,
        _ia_rate_lock,
        _client_identity(request),
        IA_RATE_LIMIT,
        IA_RATE_WINDOW_SECONDS,
        "Limite de requisições de IA excedido. Tente novamente em instantes.",
    )


def _check_queue_rate_limit(request: Request, email: str) -> None:
    _check_rate_limit(
        _queue_ip_rate_buckets,
        _queue_rate_lock,
        _client_identity(request),
        QUEUE_RATE_LIMIT,
        QUEUE_RATE_WINDOW_SECONDS,
        "Limite de solicitações de geração excedido. Tente novamente mais tarde.",
    )
    _check_rate_limit(
        _queue_email_rate_buckets,
        _queue_rate_lock,
        email.casefold(),
        QUEUE_EMAIL_RATE_LIMIT,
        QUEUE_EMAIL_RATE_WINDOW_SECONDS,
        "Este e-mail atingiu o limite de solicitações. Tente novamente mais tarde.",
    )


async def _upstream_chat(base_url: str, api_key: str, payload: dict) -> tuple[dict, int]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)

    if response.status_code >= 400:
        return {}, response.status_code

    try:
        data = response.json()
    except ValueError:
        return {}, 502

    return data, response.status_code


async def _gerar_ia(req: IAChatRequest) -> dict:
    payload = {
        "model": req.model,
        "temperature": float(req.temperature),
        "messages": [{"role": "user", "content": req.prompt.strip()}],
    }
    if req.response_format is not None:
        payload["response_format"] = req.response_format

    tentativas: list[tuple[str, str, str]] = []
    if req.model == "unsloth-auto" or req.model.startswith("unsloth"):
        tentativas.append(("unsloth", API_UNSLOTH_URL, API_UNSLOTH_KEY))
        if API_OPENROUTER_KEY:
            tentativas.append(("openrouter", API_OPENROUTER_URL, API_OPENROUTER_KEY))
    else:
        tentativas.append(("openrouter", API_OPENROUTER_URL, API_OPENROUTER_KEY))

    ultimo_status = 503
    for provider, base_url, api_key in tentativas:
        if not base_url or (provider == "unsloth" and not API_UNSLOTH_KEY) or (provider == "openrouter" and not api_key):
            continue

        data, status = await _upstream_chat(base_url, api_key, payload)
        ultimo_status = status
        if status < 400:
            choice = (data.get("choices") or [None])[0]
            content = ((choice or {}).get("message") or {}).get("content")
            model = data.get("model") or req.model
            if not content:
                raise HTTPException(status_code=502, detail="O provedor de IA retornou uma resposta vazia.")
            return {"content": content, "model": model, "provider": provider}
        if status not in {408, 409, 425, 429, 500, 502, 503, 504}:
            break

    if ultimo_status == 429:
        raise HTTPException(status_code=429, detail="Os provedores de IA estão limitando as requisições no momento.")
    raise HTTPException(status_code=502, detail="Os provedores de IA configurados estão indisponíveis.")


@app.get("/api/ia/status")
async def status_ia():
    return {
        "ok": bool(API_UNSLOTH_KEY or API_OPENROUTER_KEY),
        "unsloth": bool(API_UNSLOTH_URL and API_UNSLOTH_KEY),
        "openrouter": bool(API_OPENROUTER_KEY),
    }


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
        if not isinstance(job, dict):
            continue
        job_id = job.get("job_id")
        created_at = job.get("created_at")
        if isinstance(job_id, str) and created_at:
            items.append({"job_id": job_id, "created_at": str(created_at), "status": job.get("status", "queued")})
    return sorted(items, key=lambda item: item["created_at"])


def _queue_position(job_id: str) -> tuple[int | None, int | None]:
    items = _queue_items()
    for index, item in enumerate(items):
        if item["job_id"].lower() == job_id.lower():
            return index + 1, index
    return None, None


@app.post("/api/gerar-fase-preparatoria")
async def agendar_fase_preparatoria(request: Request, req: FasePreparatoriaRequest):
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
        job["message"] = (
            f"Solicitação registrada na fila. Posição aproximada: {position}º. "
            f"Os documentos serão enviados para {email} após o processamento."
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
