from datetime import date, datetime, timezone
import json

from fastapi import Request
from starlette.responses import JSONResponse

import main

LOGIN_WINDOW = 15 * 60
LOGIN_LIMIT = 5
LOGIN_FAILURES = {}
SESSION_IDLE_SECONDS = 30 * 60
SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
SESSION_TIMES = {}


def client_key(request: Request):
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


@main.app.middleware("http")
async def security_middleware(request: Request, call_next):
    path = request.url.path
    now = datetime.now(timezone.utc).timestamp()

    if path == "/api/auth/login" and request.method == "POST":
        key = client_key(request)
        failures = [x for x in LOGIN_FAILURES.get(key, []) if now - x < LOGIN_WINDOW]
        LOGIN_FAILURES[key] = failures
        if len(failures) >= LOGIN_LIMIT:
            return JSONResponse({"detail": "Muitas tentativas. Tente novamente em alguns minutos."}, status_code=429)
        response = await call_next(request)
        if response.status_code in (401, 403, 429):
            LOGIN_FAILURES.setdefault(key, []).append(now)
        else:
            LOGIN_FAILURES.pop(key, None)
        return response

    if path.startswith("/api/") and path not in {"/api/auth/status", "/api/auth/login", "/api/auth/bootstrap"}:
        authorization = request.headers.get("authorization", "")
        if authorization.startswith("Bearer "):
            token = authorization[7:].strip()
            if token:
                created, last_seen = SESSION_TIMES.get(token, (now, now))
                if now - created > SESSION_ABSOLUTE_SECONDS or now - last_seen > SESSION_IDLE_SECONDS:
                    SESSION_TIMES.pop(token, None)
                    main.SESSIONS.pop(token, None)
                    return JSONResponse({"detail": "Sessão expirada."}, status_code=401)
                SESSION_TIMES[token] = (created, now)

    if path in {"/api/emprestimos", "/api/emprestimos-com-exemplares"} and request.method == "POST":
        body = await request.body()

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = receive
        try:
            payload = json.loads(body.decode("utf-8"))
            value = payload.get("prevista_devolucao")
            parsed = date.fromisoformat(value)
            if parsed < date.today():
                return JSONResponse({"detail": "A data de devolução prevista não pode ser anterior a hoje."}, status_code=422)
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
            return JSONResponse({"detail": "A data de devolução prevista deve ser válida no formato AAAA-MM-DD."}, status_code=422)

    return await call_next(request)


@main.app.post("/api/emprestimos/{emprestimo_id}/devolver-parcial")
def devolver_parcial_alias(emprestimo_id: int, payload: dict, user=__import__("fastapi").Depends(main.current_user)):
    from enhancements import DevolucaoIn, enhanced_devolver
    quantidade = payload.get("quantidade") if isinstance(payload, dict) else None
    data = DevolucaoIn(quantidade=quantidade)
    return enhanced_devolver(emprestimo_id, data, user)
