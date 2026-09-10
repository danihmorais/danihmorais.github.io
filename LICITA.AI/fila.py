from __future__ import annotations

import json
import os
import re
import shutil
import smtplib
import ssl
import tempfile
import threading
import time
import uuid
import zipfile
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

import config
from montador_variaveis import montar_variaveis_fixas, filtrar_chaves_docx
from processador_docx import modificar_documento

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
QUEUE_DIR = Path(os.getenv("LICITA_QUEUE_DIR", str(Path.home() / ".local" / "share" / "licita-ai" / "fila"))).expanduser()
POLL_INTERVAL_SECONDS = max(1, int(os.getenv("LICITA_QUEUE_POLL_SECONDS", "3")))
MAX_ATTEMPTS = max(1, int(os.getenv("LICITA_QUEUE_MAX_ATTEMPTS", "3")))
SMTP_TIMEOUT_SECONDS = max(5, int(os.getenv("LICITA_SMTP_TIMEOUT", "30")))
SMTP_HOST = os.getenv("LICITA_SMTP_HOST", os.getenv("SMTP_HOST", "mail01.webnets.com.br")).strip()
SMTP_PORT = int(os.getenv("LICITA_SMTP_PORT", os.getenv("SMTP_PORT", "587")))
SMTP_USERNAME = os.getenv("LICITA_SMTP_USERNAME", os.getenv("SMTP_USERNAME", "")).strip()
SMTP_PASSWORD = os.getenv("LICITA_SMTP_PASSWORD", os.getenv("SMTP_PASSWORD", ""))
SMTP_SECURITY = os.getenv("LICITA_SMTP_SECURITY", os.getenv("SMTP_SECURITY", "starttls")).strip().lower()
SMTP_FROM = os.getenv("LICITA_SMTP_FROM", os.getenv("SMTP_FROM", SMTP_USERNAME)).strip()

_worker_thread: threading.Thread | None = None
_worker_lock = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_queue_dir() -> None:
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(QUEUE_DIR, 0o700)
    except OSError:
        pass


def _write_json(path: Path, payload: dict) -> None:
    _ensure_queue_dir()
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(QUEUE_DIR), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _job_path(job_id: str, suffix: str = "") -> Path:
    return QUEUE_DIR / f"{job_id}{suffix}.json"


def _find_job_path(job_id: str) -> Path | None:
    for suffix in ("", ".processing", ".done", ".failed"):
        path = _job_path(job_id, suffix)
        if path.is_file():
            return path
    return None


def _valor_vazio(valor) -> bool:
    if valor is None:
        return True
    texto_lower = str(valor).strip().lower()
    return not texto_lower or texto_lower in [
        "não informado", "nã£o informado", "n?o informado",
        "nao informado", "[não informado]", "[nao informado]", "[n?o informado]"
    ]


def _formata_moeda(v) -> str:
    s = f"{v:,.2f}"
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def gerar_zip(dados_usuario: dict, dados_ia: dict, session_id: str) -> tuple[Path, str]:
    temp_dir = Path(tempfile.mkdtemp(prefix=f"fase_prep_{session_id}_"))

    try:
        modificacoes = filtrar_chaves_docx(montar_variaveis_fixas(dados_usuario))

        for chave, valor in dados_ia.items():
            chave_docx = chave if chave.startswith("{{") and chave.endswith("}}") else f"{{{{{chave}}}}}"
            modificacoes[chave_docx] = valor

        for chave1, chave2 in config.ALIASES:
            val1, val2 = modificacoes.get(chave1), modificacoes.get(chave2)
            vazio1, vazio2 = _valor_vazio(val1), _valor_vazio(val2)
            if not vazio1 and vazio2:
                modificacoes[chave2] = val1
            elif not vazio2 and vazio1:
                modificacoes[chave1] = val2

        if _valor_vazio(modificacoes.get("{{MES_INICIO}}")):
            modificacoes["{{MES_INICIO}}"] = [
                "janeiro", "fevereiro", "março", "abril", "maio", "junho",
                "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
            ][datetime.now().month - 1]

        for _ in range(3):
            mudou = False
            for k, v in list(modificacoes.items()):
                if isinstance(v, str) and "{{" in v:
                    novo_v = v
                    for sub_k, sub_v in modificacoes.items():
                        if sub_k != k and sub_k in novo_v and isinstance(sub_v, str):
                            novo_v = novo_v.replace(sub_k, sub_v)
                    if novo_v != v:
                        modificacoes[k] = novo_v
                        mudou = True
            if not mudou:
                break

        itens_json = modificacoes.get("{{ITENS}}")
        if not _valor_vazio(itens_json):
            itens_str = str(itens_json)
            if itens_str.startswith("__TABLE__"):
                itens_str = itens_str.replace("__TABLE__", "")

            try:
                itens = json.loads(itens_str) if isinstance(itens_str, str) else itens_json
                itens_formatados = []
                itens_sem_valor = []

                for item in itens:
                    try:
                        valor_unit = float(item.get("valor", 0))
                    except (ValueError, TypeError):
                        valor_unit = 0.0
                    try:
                        qtd = float(item.get("qtd", 0))
                    except (ValueError, TypeError):
                        qtd = 0.0
                    total = valor_unit * qtd

                    itens_formatados.append({
                        "Item": item.get("numero", ""),
                        "Descrição": item.get("descricao", ""),
                        "UN": item.get("un", ""),
                        "Qtd": item.get("qtd", ""),
                        "Vlr Unit.": _formata_moeda(valor_unit),
                        "Total": _formata_moeda(total)
                    })

                    itens_sem_valor.append({
                        "Item": item.get("numero", ""),
                        "Descrição": item.get("descricao", ""),
                        "UN": item.get("un", ""),
                        "Qtd": item.get("qtd", "")
                    })

                modificacoes["{{ITENS}}"] = f"__TABLE__{json.dumps(itens_formatados, ensure_ascii=False)}"
                modificacoes["{{ITENS_SEMVALOR}}"] = f"__TABLE__{json.dumps(itens_sem_valor, ensure_ascii=False)}"
            except Exception:
                if not str(itens_json).startswith("__TABLE__"):
                    modificacoes["{{ITENS}}"] = f"__TABLE__{str(itens_json)}"

        arquivos_gerados = []
        for arq in config.BASE_FILES:
            cam_origem = os.path.join(config.PASTA_MODELOS, arq)
            cam_destino = temp_dir / f"Pronto_{arq}"
            if os.path.exists(cam_origem):
                modificar_documento(cam_origem, str(cam_destino), modificacoes)
                arquivos_gerados.append(cam_destino)

        if not arquivos_gerados:
            raise RuntimeError("Nenhum documento base encontrado.")

        zip_filename = f"FasePreparatoria_{session_id[:6]}.zip"
        caminho_zip = temp_dir / zip_filename
        with zipfile.ZipFile(caminho_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for arq in arquivos_gerados:
                zipf.write(arq, arq.name)

        return caminho_zip, zip_filename
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def _smtp_client():
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD:
        raise RuntimeError("SMTP do Licita.AI não está configurado. Defina LICITA_SMTP_HOST, LICITA_SMTP_USERNAME e LICITA_SMTP_PASSWORD.")
    if SMTP_SECURITY == "ssl":
        return smtplib.SMTP_SSL(
            SMTP_HOST,
            SMTP_PORT,
            timeout=SMTP_TIMEOUT_SECONDS,
            context=ssl.create_default_context(),
        )
    client = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS)
    client.ehlo()
    if SMTP_SECURITY == "starttls":
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
    elif SMTP_SECURITY != "none":
        client.quit()
        raise RuntimeError(f"Segurança SMTP inválida: {SMTP_SECURITY}")
    return client


def _enviar_email(recipient: str, zip_path: Path, filename: str, job_id: str) -> None:
    message = EmailMessage()
    message["From"] = SMTP_FROM or SMTP_USERNAME
    message["To"] = recipient
    message["Subject"] = "Licita.AI - Fase Preparatória"
    message.set_content(
        "Prezados,\n\n"
        "A solicitação realizada pelo Licita.AI foi processada com sucesso.\n\n"
        f"Identificador da solicitação: {job_id}\n"
        "Os documentos da fase preparatória seguem anexados neste e-mail.\n\n"
        "Atenciosamente,\n"
        "Licita.AI"
    )
    with zip_path.open("rb") as handle:
        message.add_attachment(
            handle.read(),
            maintype="application",
            subtype="zip",
            filename=filename,
        )
    with _smtp_client() as client:
        client.login(SMTP_USERNAME, SMTP_PASSWORD)
        client.send_message(message)


def enqueue_job(email: str, dados_usuario: dict, dados_ia: dict, instrucoes: str = "") -> dict:
    email = email.strip()
    if not EMAIL_RE.fullmatch(email):
        raise ValueError("Informe um e-mail válido para receber os documentos.")

    _ensure_queue_dir()
    job_id = uuid.uuid4().hex
    job = {
        "version": 1,
        "job_id": job_id,
        "status": "queued",
        "created_at": _utc_now(),
        "attempts": 0,
        "email": email,
        "instrucoes": instrucoes.strip(),
        "dados_usuario": dados_usuario,
        "dados_ia": dados_ia,
    }
    _write_json(_job_path(job_id), job)
    return {
        "job_id": job_id,
        "status": "queued",
        "email": email,
        "message": "Solicitação registrada na fila. Os documentos serão gerados no backend e enviados por e-mail.",
    }


def get_job(job_id: str) -> dict | None:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id, re.IGNORECASE):
        return None
    path = _find_job_path(job_id)
    if path is None:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"job_id": job_id, "status": "unavailable"}


def _claim_next_job() -> tuple[Path, dict] | None:
    _ensure_queue_dir()
    pending = sorted(QUEUE_DIR.glob("[0-9a-f]*.json"), key=lambda path: path.stat().st_mtime)
    for path in pending:
        if path.name.endswith((".processing.json", ".done.json", ".failed.json")):
            continue
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
            job_id = job.get("job_id")
            if not isinstance(job_id, str) or not re.fullmatch(r"[0-9a-f]{32}", job_id, re.IGNORECASE):
                continue
            processing_path = _job_path(job_id, ".processing")
            try:
                os.replace(path, processing_path)
            except FileNotFoundError:
                continue
            job["status"] = "processing"
            job["started_at"] = _utc_now()
            job["attempts"] = int(job.get("attempts", 0)) + 1
            _write_json(processing_path, job)
            return processing_path, job
        except (OSError, json.JSONDecodeError, ValueError):
            continue
    return None


def _process_one_job() -> None:
    claimed = _claim_next_job()
    if claimed is None:
        return

    processing_path, job = claimed
    job_id = job["job_id"]
    temp_root = None
    try:
        zip_path, zip_filename = gerar_zip(job.get("dados_usuario", {}), job.get("dados_ia", {}), job_id)
        temp_root = zip_path.parent
        _enviar_email(job["email"], zip_path, zip_filename, job_id)

        done_path = _job_path(job_id, ".done")
        job.update({
            "status": "sent",
            "completed_at": _utc_now(),
            "result": {
                "filename": zip_filename,
                "recipient": job["email"],
            },
        })
        _write_json(done_path, job)
        processing_path.unlink(missing_ok=True)
    except Exception as exc:
        attempts = int(job.get("attempts", 1))
        job["last_error"] = str(exc)
        job["last_error_at"] = _utc_now()

        if attempts < MAX_ATTEMPTS:
            job["status"] = "queued"
            pending_path = _job_path(job_id)
            _write_json(pending_path, job)
            processing_path.unlink(missing_ok=True)
        else:
            job["status"] = "failed"
            failed_path = _job_path(job_id, ".failed")
            _write_json(failed_path, job)
            processing_path.unlink(missing_ok=True)
    finally:
        if temp_root is not None:
            shutil.rmtree(temp_root, ignore_errors=True)


def _worker_loop() -> None:
    while True:
        try:
            _process_one_job()
        except Exception:
            pass
        time.sleep(POLL_INTERVAL_SECONDS)


def iniciar_worker() -> None:
    global _worker_thread
    with _worker_lock:
        if _worker_thread is not None and _worker_thread.is_alive():
            return
        _ensure_queue_dir()
        _worker_thread = threading.Thread(target=_worker_loop, name="licita-ai-fila", daemon=True)
        _worker_thread.start()
