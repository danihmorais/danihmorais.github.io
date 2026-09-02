import importlib.util
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


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
        return module.app
    finally:
        os.chdir(original_cwd)
        sys.path = original_sys_path


app_licita = load_app_from_path("licita_main", "LICITA.AI/main.py", "LICITA.AI")
app_monta = load_app_from_path("monta_main", "MONTAEDITAL/main.py", "MONTAEDITAL")
app_email = load_app_from_path("email_main", "EMAIL-ATAS-CONTRATOS/main.py", "EMAIL-ATAS-CONTRATOS")
app_extrato = load_app_from_path("extrato_main", "GERADOREXTRATO/main.py", "GERADOREXTRATO")

# O módulo TJSP fica separado do agregador para evitar importação circular.
site_root = Path(__file__).resolve().parent
tjsp_root = Path(
    os.environ.get(
        "PROJETO_TJSP_ROOT",
        str(site_root.parent / "PROJETO-TJSP"),
    )
).expanduser().resolve()
tjsp_api = tjsp_root / "app" / "tjsp_api.py"

if tjsp_api.is_file():
    app_tjsp = load_app_from_path("tjsp_api_standalone", str(tjsp_api), str(tjsp_root))
else:
    app_tjsp = None

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
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
)

app.mount("/licita", app_licita)
app.mount("/monta", app_monta)
app.mount("/email", app_email)
app.mount("/geradorextrato", app_extrato)

if app_tjsp is not None:
    app.mount("/estudos", app_tjsp)


# Pasta física usada pelos Documentos Modelo.
# Pode ser sobrescrita por DOCUMENTOS_MODELO_DIR sem alterar o código.
DEFAULT_DOCUMENTS_DIR = "/run/media/daniel/c1eb5cb7-675f-4e8c-9564-4dabc66d9164"


def _documents_root() -> Path:
    configured = os.getenv("DOCUMENTOS_MODELO_DIR", "").strip()
    candidates = [Path(configured).expanduser()] if configured else []
    candidates.extend(
        [
            Path(DEFAULT_DOCUMENTS_DIR),
            site_root / "documentos-modelo",
            site_root / "documentos_modelo",
            site_root / "DOCUMENTOS-MODELO",
            site_root / "modelos",
            site_root / "modelos_documentos",
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
            "A pasta de Documentos Modelo não está disponível. "
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "danihmorais-github-pages"}


@app.get("/files")
async def list_model_files():
    """Lista exclusivamente os Documentos Modelo disponibilizados pelo backend."""
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
                "url": f"/files/{relative}",
            }
        )

    entries.sort(key=lambda item: item["path"].casefold())
    return {"files": entries}


@app.get("/files/{file_path:path}")
async def download_model_file(file_path: str):
    root = _documents_root()
    requested = _safe_file(root, file_path)
    return FileResponse(path=requested, filename=requested.name)
