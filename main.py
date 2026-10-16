import asyncio
import hashlib
import importlib.util
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
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
    "biblioteca_routes",
    "BIBLIOTECA-MUNICIPAL/backend/routes.py",
    "BIBLIOTECA-MUNICIPAL/backend",
    compatibility_main=biblioteca_main_module,
)
load_module_from_path(
    "biblioteca_access_routes",
    "BIBLIOTECA-MUNICIPAL/backend/access_routes.py",
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
    parts = [part for part in clean.split("/") if part]

    # Bloqueia arquivos ocultos e qualquer caminho que atravesse uma pasta oculta.
    if not parts or any(part.startswith(".") for part in parts):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    requested = (root / clean).resolve()
    try:
        relative_requested = requested.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.") from exc

    # Também verifica o caminho resolvido, inclusive quando há links simbólicos.
    if (
        any(part.startswith(".") for part in relative_requested.parts)
        or not requested.is_file()
    ):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return requested


def _is_hidden_relative(relative_path: str) -> bool:
    """Retorna True quando algum componente do caminho é oculto (começa com ponto)."""
    normalized = str(relative_path).replace("\\", "/")
    return any(part.startswith(".") for part in normalized.split("/") if part)


def _safe_hidden_file(root: Path, relative_path: str) -> Path:
    """Permite somente arquivos acessados por um caminho que contenha item oculto."""
    clean = relative_path.strip().replace("\\", "/").lstrip("/")
    parts = [part for part in clean.split("/") if part]

    if (
        not parts
        or any(part in {".", ".."} for part in parts)
        or not _is_hidden_relative(clean)
    ):
        raise HTTPException(status_code=404, detail="Arquivo oculto não encontrado.")

    requested = (root / clean).resolve()
    try:
        requested.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=404, detail="Arquivo oculto não encontrado."
        ) from exc

    if not requested.is_file():
        raise HTTPException(status_code=404, detail="Arquivo oculto não encontrado.")

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

    # Usa caminhada top-down para não entrar em diretórios ocultos.
    for current_dir, dirnames, filenames in os.walk(
        root, topdown=True, followlinks=False
    ):
        dirnames[:] = sorted(
            (name for name in dirnames if not name.startswith(".")),
            key=str.casefold,
        )
        current_path = Path(current_dir)

        for filename in filenames:
            if filename.startswith("."):
                continue

            path = current_path / filename
            try:
                relative = path.relative_to(root).as_posix()
                resolved = path.resolve()
                resolved_relative = resolved.relative_to(root).as_posix()

                # Não lista caminhos ocultos nem links que apontem para eles.
                if any(
                    part.startswith(".")
                    for candidate in (relative, resolved_relative)
                    for part in candidate.split("/")
                    if part
                ):
                    continue
                if not resolved.is_file():
                    continue

                size = path.stat().st_size
            except (OSError, ValueError):
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


@app.get("/files2")
async def list_hidden_model_files():
    """Lista somente arquivos e diretórios cujo caminho contém componente oculto."""
    root = _documents_root()
    root_resolved = root.resolve()
    directories = {}
    files = []

    # Não pruna os diretórios ocultos: esta rota existe justamente para listá-los.
    for current_dir, dirnames, filenames in os.walk(
        root, topdown=True, followlinks=False
    ):
        dirnames.sort(key=str.casefold)
        current_path = Path(current_dir)

        # Inclui diretórios ocultos e descendentes dentro de uma árvore oculta.
        for dirname in dirnames:
            directory = current_path / dirname
            try:
                relative = directory.relative_to(root).as_posix()
                if not _is_hidden_relative(relative):
                    continue
                resolved = directory.resolve()
                resolved.relative_to(root_resolved)
                if not resolved.is_dir():
                    continue
            except (OSError, ValueError, RuntimeError):
                continue

            directories[relative] = {
                "name": directory.name,
                "path": relative,
                "type": "tree",
            }

        for filename in filenames:
            # O caminho completo decide: arquivos comuns dentro de pastas
            # ocultas também pertencem à listagem desta API.
            path = current_path / filename
            try:
                relative = path.relative_to(root).as_posix()
                if not _is_hidden_relative(relative):
                    continue
                resolved = path.resolve()
                resolved.relative_to(root_resolved)
                if not resolved.is_file():
                    continue
                size = path.stat().st_size
            except (OSError, ValueError, RuntimeError):
                continue

            files.append(
                {
                    "name": path.name,
                    "path": relative,
                    "type": "file",
                    "size": size,
                    "content_type": _media_type(path),
                    "url": f"/files2/{relative}",
                }
            )

    entries = list(directories.values()) + files
    entries.sort(key=lambda item: (item["path"].casefold(), item["type"] != "tree"))
    return {"files": entries, "hidden_only": True, "count": len(entries)}


_VIDEO_TRANSCODE_LOCK = threading.Lock()
_VIDEO_COMPAT_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".webm", ".ogv", ".ogg", ".mpeg", ".mpg", ".wmv", ".flv"}


def _ffmpeg_executable() -> str | None:
    configured = os.getenv("FFMPEG_BINARY", "").strip()
    if configured:
        resolved = shutil.which(configured)
        if resolved:
            return resolved
        if Path(configured).is_file():
            return str(Path(configured).resolve())

    system_binary = shutil.which("ffmpeg")
    if system_binary:
        return system_binary

    # imageio-ffmpeg inclui um binário próprio quando o sistema não tem FFmpeg.
    try:
        import imageio_ffmpeg

        bundled_binary = imageio_ffmpeg.get_ffmpeg_exe()
        if bundled_binary and Path(bundled_binary).is_file():
            return bundled_binary
    except (ImportError, RuntimeError, OSError):
        pass
    return None


def _transcode_browser_compatible(source: Path) -> Path:
    """Converte vídeo incompatível com navegador para MP4 H.264/AAC e mantém cache."""
    if source.suffix.lower() not in _VIDEO_COMPAT_EXTENSIONS and not _media_type(source).startswith("video/"):
        raise HTTPException(status_code=415, detail="O arquivo selecionado não parece ser um vídeo.")

    ffmpeg = _ffmpeg_executable()
    if not ffmpeg:
        raise HTTPException(
            status_code=503,
            detail=(
                "O servidor ainda não dispõe de FFmpeg para conversão automática. "
                "Atualize as dependências do backend e tente novamente; enquanto isso, "
                "use Abrir original ou Baixar vídeo."
            ),
        )

    try:
        stat = source.stat()
        fingerprint = f"{source.resolve()}|{stat.st_size}|{stat.st_mtime_ns}|h264-aac-v1"
        cache_key = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
        cache_dir = Path(
            os.getenv("ESTUDOS_VIDEO_CACHE_DIR", "/tmp/danihmorais-estudos-video-cache")
        ).expanduser()
        cache_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=503, detail="Não foi possível preparar o cache de conversão de vídeos."
        ) from exc

    output = cache_dir / f"{cache_key}.mp4"
    if output.is_file() and output.stat().st_size > 0:
        try:
            os.utime(output, None)
        except OSError:
            pass
        return output

    with _VIDEO_TRANSCODE_LOCK:
        if output.is_file() and output.stat().st_size > 0:
            try:
                os.utime(output, None)
            except OSError:
                pass
            return output

        cutoff = time.time() - 14 * 24 * 60 * 60
        for cached in cache_dir.glob("*.mp4"):
            if cached == output:
                continue
            try:
                if cached.stat().st_mtime < cutoff:
                    cached.unlink()
            except OSError:
                continue

        fd, temporary_name = tempfile.mkstemp(prefix=f"{cache_key}.", suffix=".mp4", dir=cache_dir)
        os.close(fd)
        temporary = Path(temporary_name)
        try:
            try:
                timeout_seconds = int(os.getenv("ESTUDOS_TRANSCODE_TIMEOUT_SECONDS", "1800"))
            except ValueError:
                timeout_seconds = 1800
            timeout_seconds = max(120, min(timeout_seconds, 7200))

            command = [
                ffmpeg,
                "-nostdin",
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-i", str(source),
                "-map", "0:v:0",
                "-map", "0:a:0?",
                "-sn",
                "-dn",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-threads", "2",
                str(temporary),
            ]
            try:
                result = subprocess.run(
                    command,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout_seconds,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise HTTPException(
                    status_code=504,
                    detail="A conversão demorou mais que o limite configurado. Tente novamente ou baixe o arquivo original.",
                ) from exc

            if result.returncode != 0 or not temporary.is_file() or temporary.stat().st_size == 0:
                diagnostic = (result.stderr or "").strip().splitlines()
                diagnostic = diagnostic[-1][:280] if diagnostic else "O FFmpeg não gerou um arquivo de saída."
                raise HTTPException(
                    status_code=422,
                    detail=f"Não foi possível converter este vídeo para H.264/AAC. {diagnostic}",
                )

            os.replace(temporary, output)
            try:
                os.utime(output, None)
            except OSError:
                pass
            return output
        except HTTPException:
            raise
        except OSError as exc:
            raise HTTPException(
                status_code=503, detail="Falha de acesso ao cache durante a conversão do vídeo."
            ) from exc
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


@app.head("/files2/{file_path:path}")
async def head_hidden_model_file(file_path: str, compat: bool = False):
    root = _documents_root()
    source = _safe_hidden_file(root, file_path)
    requested = await asyncio.to_thread(_transcode_browser_compatible, source) if compat else source
    size = requested.stat().st_size
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(size),
            "Content-Type": "video/mp4" if compat else _media_type(source),
            "Content-Disposition": _content_disposition(source, download=False),
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/files2/{file_path:path}")
async def serve_hidden_model_file(
    file_path: str, request: Request, download: bool = False, compat: bool = False
):
    root = _documents_root()
    source = _safe_hidden_file(root, file_path)
    requested = await asyncio.to_thread(_transcode_browser_compatible, source) if compat else source
    size = requested.stat().st_size
    media_type = "video/mp4" if compat else _media_type(source)
    range_header = request.headers.get("range")
    interval = _parse_range(range_header, size)
    disposition = _content_disposition(source, download=download)

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
                "Content-Disposition": disposition,
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
            "Content-Disposition": disposition,
            "X-Content-Type-Options": "nosniff",
        },
    )


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
