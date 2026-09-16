import importlib.util
import mimetypes
import os
import sys
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse


def load_app_from_path(module_name, file_path, dir_name):
    original_cwd = os.getcwd()
    original_sys_path = sys.path.copy()

    abs_dir = os.path.abspath(dir_name)
    os.chdir(abs_dir)
    sys.path.insert(0, abs_dir)
    sys.path.insert(0, original_cwd)

    try:
        abs_file_path = os.path.join(original_cwd, file_path)
        spec = importlib.util.spec_from_file_location(module_name, abs_file_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Não foi possível carregar {file_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        if hasattr(module, "init_db"):
            module.app.init_db = module.init_db
        return module.app
    finally:
        os.chdir(original_cwd)
        sys.path = original_sys_path


def load_module_from_path(module_name, file_path, dir_name, compatibility_main=None):
    original_cwd = os.getcwd()
    original_sys_path = sys.path.copy()
    original_main = sys.modules.get("main")

    abs_dir = os.path.abspath(dir_name)
    os.chdir(abs_dir)
    sys.path.insert(0, abs_dir)
    sys.path.insert(0, original_cwd)

    try:
        if compatibility_main is not None:
            sys.modules["main"] = compatibility_main
        abs_file_path = os.path.join(original_cwd, file_path)
        spec = importlib.util.spec_from_file_location(module_name, abs_file_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Não foi possível carregar {file_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        if original_main is not None:
            sys.modules["main"] = original_main
        else:
            sys.modules.pop("main", None)
        os.chdir(original_cwd)
        sys.path = original_sys_path


app_licita = load_app_from_path("licita_main", "LICITA.AI/main.py", "LICITA.AI")
app_monta = load_app_from_path("monta_main", "MONTAEDITAL/main.py", "MONTAEDITAL")
app_email = load_app_from_path("email_main", "EMAIL-ATAS-CONTRATOS/main.py", "EMAIL-ATAS-CONTRATOS")
app_extrato = load_app_from_path("extrato_main", "GERADOREXTRATO/main.py", "GERADOREXTRATO")

site_root = Path(__file__).resolve().parent

app = FastAPI(title="Universo da Licitação API")

cors_origins = {
    "https://danihmorais.github.io",
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1",
    "http://127.0.0.1:8000",
}
cors_origins.update(
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(cors_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Accept-Ranges", "Content-Length", "Content-Range", "Content-Disposition"],
)

app.mount("/licita", app_licita)
app.mount("/monta", app_monta)
app.mount("/email", app_email)
app.mount("/geradorextrato", app_extrato)

biblioteca_data_dir = site_root / "BIBLIOTECA-MUNICIPAL" / "data"
os.environ.setdefault("BIBLIOTECA_DATA_DIR", str(biblioteca_data_dir))
app_biblioteca = load_app_from_path(
    "biblioteca_main",
    "BIBLIOTECA-MUNICIPAL/backend/main.py",
    "BIBLIOTECA-MUNICIPAL/backend",
)

biblioteca_main_module = sys.modules["biblioteca_main"]
biblioteca_main_module.SESSION_IDLE_SECONDS = 30 * 60
biblioteca_main_module.SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
load_module_from_path(
    "biblioteca_security",
    "BIBLIOTECA-MUNICIPAL/backend/security.py",
    "BIBLIOTECA-MUNICIPAL/backend",
    compatibility_main=biblioteca_main_module,
)
load_module_from_path(
    "biblioteca_enhancements",
    "BIBLIOTECA-MUNICIPAL/backend/enhancements.py",
    "BIBLIOTECA-MUNICIPAL/backend",
    compatibility_main=biblioteca_main_module,
)
load_module_from_path(
    "biblioteca_exemplares",
    "BIBLIOTECA-MUNICIPAL/backend/exemplares.py",
    "BIBLIOTECA-MUNICIPAL/backend",
    compatibility_main=biblioteca_main_module,
)
load_module_from_path(
    "biblioteca_route_fix",
    "BIBLIOTECA-MUNICIPAL/backend/route_fix.py",
    "BIBLIOTECA-MUNICIPAL/backend",
    compatibility_main=biblioteca_main_module,
)
app_biblioteca.init_db()
app.mount("/biblioteca-api", app_biblioteca)


DEFAULT_DOCUMENTS_DIR = "/run/media/daniel/c1eb5cb7-675f-4e8c-9564-4dabc66d9164"


def _documents_root() -> Path:
    configured = (
        os.getenv("DOCUMENTOS_LICITACAO_DIR", "").strip()
        or os.getenv("DOCUMENTOS_MODELO_DIR", "").strip()
    )
    candidates = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            Path(DEFAULT_DOCUMENTS_DIR),
            site_root / "documentos-licitacao",
            site_root / "documentos-modelo",
            site_root / "documentos_modelo",
            site_root / "DOCUMENTOS-MODELO",
            site_root / "modelos",
            site_root / "modelos_documentos",
            Path.home() / "Documentos Licitação",
            Path.home() / "Documentos Modelo",
            Path.home() / "Documentos_Modelo",
            Path.home() / "documentos-modelo",
            Path.home() / "modelos",
        ]
    )

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.is_dir():
            return resolved

    configured_text = configured or DEFAULT_DOCUMENTS_DIR
    raise HTTPException(
        status_code=503,
        detail=(
            "A pasta de Documentos da Licitação não está disponível. "
            f"Caminho configurado/fallback: {configured_text}."
        ),
    )


def _safe_file(root: Path, relative_path: str) -> Path:
    clean = relative_path.strip().replace("\\", "/").lstrip("/")
    if not clean or clean in {".", ".."}:
        raise HTTPException(status_code=404, detail="Arquivo não informado.")

    requested = (root / clean).resolve()
    try:
        requested.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.") from exc

    if not requested.is_file() or requested.name.startswith("."):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return requested


def _media_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if path.suffix.lower() == ".pdf":
        return "application/pdf"
    if path.suffix.lower() == ".mp4":
        return "video/mp4"
    return guessed or "application/octet-stream"


def _content_disposition(path: Path, download: bool) -> str:
    disposition = "attachment" if download else "inline"
    safe_name = path.name.replace('"', "")
    encoded_name = quote(path.name, safe="")
    return f'{disposition}; filename="{safe_name}"; filename*=UTF-8\'\'{encoded_name}'


def _parse_range(range_header: str | None, size: int) -> tuple[int, int] | None:
    if not range_header or not range_header.lower().startswith("bytes="):
        return None

    value = range_header[6:].split(",", 1)[0].strip()
    if not value or "-" not in value:
        return None

    start_text, end_text = value.split("-", 1)
    try:
        if start_text == "":
            suffix_length = int(end_text)
            if suffix_length <= 0:
                return None
            start = max(size - suffix_length, 0)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
    except ValueError:
        return None

    if start < 0 or start >= size or end < start:
        raise HTTPException(status_code=416, detail="Intervalo de bytes inválido.")

    return start, min(end, size - 1)


def _iter_file(path: Path, start: int, end: int, chunk_size: int = 1024 * 1024):
    with path.open("rb") as file:
        file.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@app.get("/health")
async def health():
    return {"status": "ok", "service": "danihmorais-github-pages"}


@app.get("/files")
async def list_model_files():
    root = _documents_root()
    entries = []
    for path in root.rglob("*"):
        if not path.is_file() or path.name.startswith("."):
            continue
        try:
            relative = path.relative_to(root).as_posix()
            size = path.stat().st_size
        except OSError:
            continue
        entries.append(
            {
                "name": path.name,
                "path": relative,
                "type": "file",
                "size": size,
                "content_type": _media_type(path),
                "url": f"/files/{relative}",
            }
        )

    entries.sort(key=lambda item: item["path"].casefold())
    return {"files": entries}


@app.head("/files/{file_path:path}")
async def head_model_file(file_path: str):
    root = _documents_root()
    requested = _safe_file(root, file_path)
    size = requested.stat().st_size
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(size),
            "Content-Type": _media_type(requested),
            "Content-Disposition": _content_disposition(requested, download=False),
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/files/{file_path:path}")
async def serve_model_file(file_path: str, request: Request):
    root = _documents_root()
    requested = _safe_file(root, file_path)
    size = requested.stat().st_size
    media_type = _media_type(requested)
    range_header = request.headers.get("range")
    interval = _parse_range(range_header, size)

    if interval:
        start, end = interval
        return StreamingResponse(
            _iter_file(requested, start, end),
            status_code=206,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{end}/{size}",
                "Content-Length": str(end - start + 1),
                "Content-Disposition": _content_disposition(requested, False),
                "X-Content-Type-Options": "nosniff",
            },
        )

    return StreamingResponse(
        _iter_file(requested, 0, size - 1),
        status_code=200,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(size),
            "Content-Disposition": _content_disposition(requested, False),
            "X-Content-Type-Options": "nosniff",
        },
    )
