"""Backend local para o enviador de instrumentos contratuais."""
from __future__ import annotations

import json
import re
import smtplib
import ssl
import tempfile
from email.message import EmailMessage
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

app = FastAPI(title="Enviador de Atas e Contratos")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://danihmorais.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
ALLOWED_EMAIL_TAGS = {"p", "br", "strong", "b", "em", "i", "ul", "ol", "li"}


class SmtpSettings(BaseModel):
    host: str = ""
    port: int = Field(default=587, ge=1, le=65535)
    username: str = ""
    password: str = ""
    security: Literal["starttls", "ssl", "none"] = "starttls"
    save_locally: bool = False


class _EmailHtmlSanitizer(HTMLParser):
    """Preserva somente marcação básica, sem atributos ou conteúdo executável."""
    def __init__(self):
        super().__init__()
        self.html_parts: list[str] = []
        self.text_parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs):
        tag = tag.lower()
        if tag in {"script", "style"}:
            self.ignored_depth += 1
            return
        if self.ignored_depth:
            return
        if tag not in ALLOWED_EMAIL_TAGS:
            return
        self.html_parts.append(f"<{tag}>")
        if tag == "br":
            self.text_parts.append("\n")
        elif tag in {"p", "li"} and self.text_parts:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in {"script", "style"}:
            self.ignored_depth = max(0, self.ignored_depth - 1)
            return
        if self.ignored_depth:
            return
        if tag in ALLOWED_EMAIL_TAGS and tag != "br":
            self.html_parts.append(f"</{tag}>")
            if tag in {"p", "li"}:
                self.text_parts.append("\n")

    def handle_data(self, data: str):
        if self.ignored_depth:
            return
        self.html_parts.append(escape(data))
        self.text_parts.append(data)


def sanitize_email_html(value: str) -> tuple[str, str]:
    sanitizer = _EmailHtmlSanitizer()
    sanitizer.feed(value)
    sanitizer.close()
    html_body = "".join(sanitizer.html_parts).strip() or "<p></p>"
    text_body = "".join(sanitizer.text_parts)
    text_body = re.sub(r"\n{3,}", "\n\n", text_body).strip()
    return html_body, text_body


def _pdf_text(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise ValueError(f"Não foi possível ler o PDF: {exc}") from exc


def find_institutional_email(text: str) -> str | None:
    """Retorna o e-mail associado à segunda ocorrência de 'E-mail institucional'."""
    matches = list(re.finditer(r"e[\-\s]*mail\s+institucional", text, flags=re.IGNORECASE))
    if len(matches) < 2:
        return None
    start = matches[1].end()
    # O e-mail normalmente está logo à frente do rótulo; a janela evita pegar dados de outra seção.
    nearby = text[start:start + 350]
    email = EMAIL_RE.search(nearby)
    return email.group(0).rstrip(".,;:") if email else None


async def _save_upload(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "documento.pdf").suffix.lower()
    if suffix != ".pdf":
        raise HTTPException(status_code=400, detail=f"{upload.filename}: envie apenas arquivos PDF.")
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        content = await upload.read()
        handle.write(content)
        return handle.name
    finally:
        handle.close()


@app.post("/api/extract-recipients")
async def extract_recipients(files: list[UploadFile] = File(...)):
    results = []
    for upload in files:
        temp_path = await _save_upload(upload)
        try:
            results.append({
                "filename": upload.filename or "documento.pdf",
                "recipient": find_institutional_email(_pdf_text(temp_path)),
            })
        except ValueError as exc:
            results.append({"filename": upload.filename or "documento.pdf", "recipient": None, "error": str(exc)})
        finally:
            Path(temp_path).unlink(missing_ok=True)
    return results


def _smtp_client(settings: SmtpSettings):
    timeout = 30
    if settings.security == "ssl":
        return smtplib.SMTP_SSL(settings.host, settings.port, timeout=timeout, context=ssl.create_default_context())
    client = smtplib.SMTP(settings.host, settings.port, timeout=timeout)
    client.ehlo()
    if settings.security == "starttls":
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
    return client


@app.post("/api/send")
async def send_documents(
    files: list[UploadFile] = File(...),
    recipients: str = Form(...),
    subject: str = Form(...),
    body_html: str = Form(...),
    settings_json: str = Form(...),
):
    try:
        settings = SmtpSettings.model_validate_json(settings_json)
        recipient_list = json.loads(recipients)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Dados de envio inválidos.") from exc
    if not settings.host or not settings.username:
        raise HTTPException(status_code=400, detail="Informe o servidor SMTP e o e-mail remetente.")
    if len(files) != len(recipient_list):
        raise HTTPException(status_code=400, detail="A lista de destinatários não corresponde aos arquivos.")
    clean_html, plain_body = sanitize_email_html(body_html)

    sent, failures = [], []
    for upload, recipient in zip(files, recipient_list):
        if not isinstance(recipient, str) or not EMAIL_RE.fullmatch(recipient.strip()):
            failures.append({"filename": upload.filename, "error": "Destinatário inválido ou não localizado."})
            continue
        temp_path = await _save_upload(upload)
        try:
            message = EmailMessage()
            message["From"] = settings.username
            message["To"] = recipient.strip()
            message["Cc"] = settings.username
            message["Subject"] = subject
            message.set_content(plain_body)
            message.add_alternative(clean_html, subtype="html")
            with open(temp_path, "rb") as pdf:
                message.add_attachment(pdf.read(), maintype="application", subtype="pdf", filename=upload.filename or "documento.pdf")
            with _smtp_client(settings) as client:
                if settings.password:
                    client.login(settings.username, settings.password)
                client.send_message(message)
            sent.append({"filename": upload.filename, "recipient": recipient.strip()})
        except Exception as exc:
            failures.append({"filename": upload.filename, "error": str(exc)})
        finally:
            Path(temp_path).unlink(missing_ok=True)
    return {"sent": sent, "failures": failures}
