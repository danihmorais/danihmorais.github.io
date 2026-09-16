from datetime import date, datetime, timezone
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

import main

LOGIN_WINDOW = 15 * 60
LOGIN_LIMIT = 5
LOGIN_FAILURES = {}
SESSION_IDLE_SECONDS = 30 * 60
SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
SESSION_TIMES = {}
TRUSTED_PROXY_IPS = {x.strip() for x in os.getenv("BIBLIOTECA_TRUSTED_PROXY_IPS", "").split(",") if x.strip()}


def client_key(request: Request):
    host = request.client.host if request.client else "unknown"
    if host in TRUSTED_PROXY_IPS:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return host


def normalize_isbn(value: str):
    raw = value.strip().upper()
    raw = re.sub(r"^ISBN(?:-1[03])?\s*[:.]?\s*", "", raw)
    return "".join(ch for ch in raw if ch.isdigit() or ch == "X")


def isbn10_to_13(isbn: str):
    body = "978" + isbn[:9]
    total = sum((1 if i % 2 == 0 else 3) * int(ch) for i, ch in enumerate(body))
    return body + str((10 - total % 10) % 10)


def valid_isbn(isbn: str):
    if len(isbn) == 10:
        if not re.fullmatch(r"[0-9]{9}[0-9X]", isbn):
            return False
        total = sum((10 - i) * (10 if ch == "X" else int(ch)) for i, ch in enumerate(isbn))
        return total % 11 == 0
    if len(isbn) == 13 and isbn.isdigit():
        total = sum((1 if i % 2 == 0 else 3) * int(ch) for i, ch in enumerate(isbn[:12]))
        return (10 - total % 10) % 10 == int(isbn[12])
    return False


def year_from(value):
    match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", str(value or ""))
    return int(match.group(1)) if match else None


def result_from_openlibrary(isbn, payload):
    item = payload.get(f"ISBN:{isbn}") if isinstance(payload, dict) else None
    if not item:
        return None
    return {
        "isbn": isbn,
        "titulo": item.get("title", ""),
        "autor": ", ".join(x.get("name", "") for x in item.get("authors", []) if x.get("name")),
        "editora": ", ".join(x.get("name", "") for x in item.get("publishers", []) if x.get("name")),
        "ano": year_from(item.get("publish_date")),
        "idioma": "Português",
        "descricao": item.get("notes", "") if isinstance(item.get("notes"), str) else "",
        "fonte": "Open Library",
    }


def result_from_openlibrary_isbn(isbn, payload):
    if not isinstance(payload, dict):
        return None
    authors = []
    for author in payload.get("authors", []) or []:
        if isinstance(author, dict) and author.get("name"):
            authors.append(author["name"])
        elif isinstance(author, str):
            authors.append(author)
    publishers = []
    for publisher in payload.get("publishers", []) or []:
        if isinstance(publisher, dict) and publisher.get("name"):
            publishers.append(publisher["name"])
        elif isinstance(publisher, str):
            publishers.append(publisher)
    title = payload.get("title") or ""
    if not title and not authors and not publishers:
        return None
    return {
        "isbn": isbn,
        "titulo": title,
        "autor": ", ".join(authors),
        "editora": ", ".join(publishers),
        "ano": year_from(payload.get("publish_date")),
        "idioma": "Português",
        "descricao": payload.get("notes", "") if isinstance(payload.get("notes"), str) else "",
        "fonte": "Open Library",
    }


def lookup_isbn_data(isbn):
    encoded = urllib.parse.quote(isbn)
    headers = {"User-Agent": "BibliotecaMunicipalCarlosEduardoTelles/2.0"}
    sources = [
        (f"https://openlibrary.org/api/books?bibkeys=ISBN:{encoded}&jscmd=data&format=json", "legacy"),
        (f"https://openlibrary.org/isbn/{encoded}.json", "isbn"),
        (f"https://www.googleapis.com/books/v1/volumes?q=isbn:{encoded}&maxResults=5", "google"),
    ]
    for url, kind in sources:
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if kind == "legacy":
                result = result_from_openlibrary(isbn, payload)
                if result and (result["titulo"] or result["autor"]):
                    return result
            elif kind == "isbn":
                result = result_from_openlibrary_isbn(isbn, payload)
                if result:
                    return result
            else:
                for item in payload.get("items") or []:
                    info = item.get("volumeInfo") or {}
                    if info.get("title") or info.get("authors"):
                        return {
                            "isbn": isbn,
                            "titulo": info.get("title", ""),
                            "autor": ", ".join(info.get("authors") or []),
                            "editora": info.get("publisher", ""),
                            "ano": year_from(info.get("publishedDate")),
                            "idioma": info.get("language", "") or "Português",
                            "descricao": info.get("description", ""),
                            "fonte": "Google Books",
                        }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            continue
    return None


def isbn_response(codigo):
    isbn = normalize_isbn(codigo)
    if not valid_isbn(isbn):
        raise HTTPException(400, "Código não é um ISBN válido. Confira os dígitos e tente novamente.")
    result = lookup_isbn_data(isbn)
    if not result and len(isbn) == 10:
        result = lookup_isbn_data(isbn10_to_13(isbn))
        if result:
            result["isbn"] = isbn
    if result:
        return result
    raise HTTPException(404, "ISBN válido, mas não encontrei os dados bibliográficos nas fontes consultadas. O livro pode ser cadastrado manualmente.")


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
            session = main.SESSIONS.get(token)
            if session:
                created, last_seen = SESSION_TIMES.get(token, (now, now))
                if now - created > SESSION_ABSOLUTE_SECONDS or now - last_seen > SESSION_IDLE_SECONDS:
                    SESSION_TIMES.pop(token, None)
                    main.SESSIONS.pop(token, None)
                    return JSONResponse({"detail": "Sessão expirada."}, status_code=401)
                SESSION_TIMES[token] = (created, now)

                if path == "/api/usuarios" and request.method == "GET":
                    if session.get("perfil") != "Administrador":
                        return JSONResponse({"detail": "Somente administradores podem listar usuários."}, status_code=403)
                    conn = main.db()
                    incluir_inativos = request.query_params.get("incluir_inativos", "false").lower() in {"1", "true", "sim", "yes"}
                    clause = "1=1" if incluir_inativos else "ativo=1"
                    rows = conn.execute(f"SELECT * FROM usuarios WHERE {clause} ORDER BY ativo DESC,nome COLLATE NOCASE").fetchall()
                    conn.close()
                    return JSONResponse([{**main.public_user(row), "ativo": bool(row["ativo"])} for row in rows])

                if path == "/api/livros/buscar-isbn" and request.method == "GET":
                    try:
                        return JSONResponse(isbn_response(request.query_params.get("codigo", "")))
                    except HTTPException as exc:
                        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

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
def devolver_parcial_alias(emprestimo_id: int, payload: dict, user=Depends(main.current_user)):
    from enhancements import DevolucaoIn, enhanced_devolver
    quantidade = payload.get("quantidade") if isinstance(payload, dict) else None
    data = DevolucaoIn(quantidade=quantidade)
    return enhanced_devolver(emprestimo_id, data, user)
