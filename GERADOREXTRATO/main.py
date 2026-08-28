"""Backend do Gerador de Extrato de Ata/Contrato."""
from __future__ import annotations

import calendar
import io
import re
import tempfile
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

MAX_UPLOAD_SIZE_BYTES = 40 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]
MODEL_DIRS = [
    ROOT / "DOCUMENTOS MODELO" / "Documentos Modelo",
    ROOT.parent / "DOCUMENTOS MODELO" / "Documentos Modelo",
    Path(__file__).resolve().parent / "modelos",
]
MODALITIES = {
    "Pregão Eletrônico",
    "Pregão Presencial",
    "Dispensa",
    "Concorrência Eletrônica",
    "Concorrência Presencial",
    "Inexigibilidade",
}
INSTRUMENTS = {"Ata", "Contrato"}

app = FastAPI(title="Gerador de Extrato de Ata/Contrato")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://danihmorais.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CNPJ_RE = re.compile(r"\b\d{2}[.\s]?\d{3}[.\s]?\d{3}\s*/\s?\d{4}\s*-\s?\d{2}\b")
PAIR_RE = re.compile(r"\b(\d{1,4})\s*/\s*(\d{4})\b")
DATE_RE = re.compile(r"^\s*(\d{2})[/-](\d{2})[/-](\d{4})\s*$")
MODALITY_PATTERNS = [
    ("Pregão Eletrônico", re.compile(r"preg[aã]o\s+eletr[oô]nico", re.I)),
    ("Pregão Presencial", re.compile(r"preg[aã]o\s+presencial", re.I)),
    ("Concorrência Eletrônica", re.compile(r"concorr[eê]ncia\s+eletr[oô]nica", re.I)),
    ("Concorrência Presencial", re.compile(r"concorr[eê]ncia\s+presencial", re.I)),
    ("Dispensa", re.compile(r"\bdispensa(?:\s+de\s+licita[cç][aã]o)?\b", re.I)),
    ("Inexigibilidade", re.compile(r"\binexigibilidade\b", re.I)),
]


class SupplierData(BaseModel):
    filename: str
    process_number: str | None = None
    modality_number: str | None = None
    detected_modality: str | None = None
    object: str | None = None
    contractor: str | None = None
    cnpj: str | None = None
    value: str | None = None
    signature_date: str | None = None
    signature_datetime: str | None = None
    vigencia_meses: int | None = Field(default=None, ge=1, le=240)
    error: str | None = None


class GenerateData(BaseModel):
    modality: str
    instrument: str
    process_number: str | None = None
    modality_number: str | None = None
    sector: str
    vigencia_inicial: str
    data_extrato: str
    documents: list[SupplierData]


def normalize_text(value: str) -> str:
    value = value.replace("\u00a0", " ").replace("\u00ad", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def number_year(value: str | None) -> str | None:
    if not value:
        return None
    match = PAIR_RE.search(value.replace(" ", ""))
    return f"{int(match.group(1))}/{match.group(2)}" if match else None


def normalize_cnpj(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:14]}"


def extract_process(text: str) -> str | None:
    patterns = [
        r"processo(?:\s+administrativo)?\s*(?:n[º°o.]?|n[uú]mero)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"proc\.\s*(?:n[º°o.]?\s*)?(\d{1,4}\s*/\s*\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return number_year(match.group(1))
    return None


def extract_modality(text: str) -> tuple[str | None, str | None]:
    for label, pattern in MODALITY_PATTERNS:
        match = pattern.search(text)
        if match:
            number_match = PAIR_RE.search(text[match.end() : match.end() + 100])
            return label, number_year(number_match.group(0) if number_match else None)
    return None, None


def extract_object(text: str) -> str | None:
    match = re.search(
        r"OBJETO\s*:\s*(.*?)(?=\n\s*(?:\d+(?:\.\d+)*\s*[-.)]|VIG[ÊE]NCIA\s*:|VALOR\s*(?:\(\s*R\$\s*\))?\s*:|CNPJ\b|CONTRATADA\s*:)|\Z)",
        text,
        re.I | re.S,
    )
    if not match:
        return None
    value = re.sub(r"\s+", " ", match.group(1)).strip().rstrip(".;")
    return value or None


def extract_contractor(text: str) -> str | None:
    match = re.search(r"CONTRATADA\s*:\s*([^\n]+)", text, re.I)
    return match.group(1).strip() if match else None


def extract_value(text: str, last_page: str) -> str | None:
    match = re.search(
        r"Total\s+do\s+Proponente\s*[:\-]?\s*(?:R\$\s*)?([0-9][0-9.\s]*,\d{2})",
        text,
        re.I,
    )
    if not match:
        match = re.search(
            r"VALOR\s*\(\s*R\$\s*\)\s*[:\-]?\s*(?:R\$\s*)?([0-9][0-9.\s]*,\d{2})",
            last_page,
            re.I,
        )
    return re.sub(r"\s+", "", match.group(1)) if match else None


def parse_signature_date(raw: Any) -> datetime | None:
    match = re.search(r"D:(\d{14})", str(raw or ""))
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%d%H%M%S")
    except ValueError:
        return None


def extract_signature_dates(reader: PdfReader) -> list[datetime]:
    dates: list[datetime] = []
    try:
        fields = reader.get_fields() or {}
    except Exception:
        fields = {}
    for field in fields.values():
        if field.get("/FT") != "/Sig" or not field.get("/V"):
            continue
        try:
            signature = field["/V"].get_object()
            parsed = parse_signature_date(signature.get("/M"))
            if parsed:
                dates.append(parsed)
        except Exception:
            pass
    for page in reader.pages:
        for annotation_ref in page.get("/Annots", []):
            try:
                annotation = annotation_ref.get_object()
                if annotation.get("/FT") != "/Sig" or not annotation.get("/V"):
                    continue
                signature = annotation["/V"].get_object()
                parsed = parse_signature_date(signature.get("/M"))
                if parsed:
                    dates.append(parsed)
            except Exception:
                pass
    return sorted(set(dates))


def extract_vigencia(text: str) -> int | None:
    for match in re.finditer(r"vig[êe]ncia", text, re.I):
        nearby = text[match.start() : match.start() + 1200]
        duration = re.search(r"\b(\d{1,3})\s*(?:\([^)]*\)\s*)?mes(?:es)?\b", nearby, re.I)
        if duration:
            months = int(duration.group(1))
            if 1 <= months <= 240:
                return months
    return None


def read_pdf(path: str) -> SupplierData:
    filename = Path(path).name
    try:
        reader = PdfReader(path)
        pages = [page.extract_text() or "" for page in reader.pages]
        if not pages:
            raise ValueError("PDF sem páginas legíveis.")
        text = normalize_text("\n".join(pages))
        first_pages = normalize_text("\n".join(pages[:3]))
        last_page = normalize_text(pages[-1])
        detected_modality, modality_number = extract_modality(first_pages)
        unique_cnpjs: list[str] = []
        for match in CNPJ_RE.finditer(text):
            cnpj = normalize_cnpj(match.group(0))
            if cnpj not in unique_cnpjs:
                unique_cnpjs.append(cnpj)
        signatures = extract_signature_dates(reader)
        signature = signatures[-1] if signatures else None
        return SupplierData(
            filename=filename,
            process_number=extract_process(first_pages),
            modality_number=modality_number,
            detected_modality=detected_modality,
            object=extract_object(first_pages),
            contractor=extract_contractor(first_pages),
            cnpj=unique_cnpjs[1] if len(unique_cnpjs) >= 2 else None,
            value=extract_value(text, last_page),
            signature_date=signature.strftime("%d/%m/%Y") if signature else None,
            signature_datetime=signature.strftime("%Y-%m-%dT%H:%M:%S") if signature else None,
            vigencia_meses=extract_vigencia(text),
        )
    except Exception as exc:
        return SupplierData(filename=filename, error=str(exc))


async def save_upload(upload: UploadFile) -> str:
    if Path(upload.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail=f"{upload.filename}: envie apenas arquivos PDF.")
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    total = 0
    try:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(status_code=413, detail=f"{upload.filename}: limite de 40 MB por PDF.")
            handle.write(chunk)
        return handle.name
    except Exception:
        Path(handle.name).unlink(missing_ok=True)
        raise
    finally:
        handle.close()


async def analyze_upload(upload: UploadFile) -> SupplierData:
    path = await save_upload(upload)
    try:
        return await run_in_threadpool(read_pdf, path)
    finally:
        Path(path).unlink(missing_ok=True)


def br_date(value: str) -> date:
    match = DATE_RE.fullmatch(value)
    if not match:
        raise ValueError(f"Data inválida: use DD/MM/AAAA ({value}).")
    try:
        return date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
    except ValueError as exc:
        raise ValueError(f"Data inválida: {value}.") from exc


def add_months(start: date, months: int) -> date:
    total = start.year * 12 + start.month - 1 + months
    year, month_index = divmod(total, 12)
    month = month_index + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def find_template(instrument: str) -> Path:
    name = "EXTRATO ATA.docx" if instrument == "Ata" else "EXTRATO CONTRATO.docx"
    for directory in MODEL_DIRS:
        path = directory / name
        if path.exists():
            return path
    raise FileNotFoundError(f"Modelo '{name}' não encontrado.")


def replace_paragraph_nodes(paragraph_element: Any, replacements: dict[str, str]) -> None:
    w_t = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
    nodes = [element for element in paragraph_element.iter() if element.tag == w_t]
    if not nodes:
        return
    for old, new in replacements.items():
        while True:
            texts = [node.text or "" for node in nodes]
            full = "".join(texts)
            start = full.find(old)
            if start < 0:
                break
            end = start + len(old)
            cursor = 0
            start_index = end_index = None
            start_offset = end_offset = 0
            for index, text in enumerate(texts):
                next_cursor = cursor + len(text)
                if start_index is None and start < next_cursor:
                    start_index, start_offset = index, start - cursor
                if end <= next_cursor:
                    end_index, end_offset = index, end - cursor
                    break
                cursor = next_cursor
            if start_index is None or end_index is None:
                break
            if start_index == end_index:
                text = texts[start_index]
                nodes[start_index].text = text[:start_offset] + new + text[end_offset:]
            else:
                suffix = texts[end_index][end_offset:]
                nodes[start_index].text = texts[start_index][:start_offset] + new + suffix
                for index in range(start_index + 1, end_index + 1):
                    nodes[index].text = ""


def replace_placeholders(doc: Any, replacements: dict[str, str]) -> None:
    parts = [doc.part.element]
    for section in doc.sections:
        parts.extend([
            section.header.part.element,
            section.first_page_header.part.element,
            section.even_page_header.part.element,
            section.footer.part.element,
            section.first_page_footer.part.element,
            section.even_page_footer.part.element,
        ])
    w_p = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"
    for part in parts:
        for element in part.iter():
            if element.tag == w_p:
                replace_paragraph_nodes(element, replacements)


def append_page_break(body: Any) -> None:
    from docx.oxml import OxmlElement

    paragraph = OxmlElement("w:p")
    run = OxmlElement("w:r")
    break_element = OxmlElement("w:br")
    break_element.set("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type", "page")
    run.append(break_element)
    paragraph.append(run)
    body.insert(len(body) - 1, paragraph)


def append_body(doc: Any, elements: list[Any]) -> None:
    body = doc._element.body
    position = len(body) - 1
    for element in elements:
        body.insert(position, deepcopy(element))
        position += 1


def replacements(common: GenerateData, item: SupplierData, final_date: str) -> dict[str, str]:
    return {
        "{{DATA.ASS}}": item.signature_date or "",
        "{{MODALIDADE}}": common.modality,
        "{{INSTRUMENTO}}": common.instrument,
        "{{N.PROCESSO}}": item.process_number or common.process_number or "",
        "{{N.MODALIDADE}}": item.modality_number or common.modality_number or "",
        "{{OBJETO}}": item.object or "",
        "{{SETOR}}": common.sector.strip(),
        "{{CONTRATADA}}": item.contractor or "",
        "{{CNPJ}}": item.cnpj or "",
        "{{VALOR}}": item.value or "",
        "{{VIG.INICIAL}}": common.vigencia_inicial,
        "{{VIG.FINAL}}": final_date,
        "{{DATA.EXTRATO}}": common.data_extrato,
    }


def validate_generate(data: GenerateData) -> None:
    if data.modality not in MODALITIES:
        raise ValueError("Modalidade inválida.")
    if data.instrument not in INSTRUMENTS:
        raise ValueError("Instrumento inválido.")
    if not data.sector.strip():
        raise ValueError("Informe o setor.")
    br_date(data.vigencia_inicial)
    br_date(data.data_extrato)
    if data.process_number and not number_year(data.process_number):
        raise ValueError("Nº do processo deve estar no formato XX/XXXX.")
    if data.modality_number and not number_year(data.modality_number):
        raise ValueError("Nº da modalidade deve estar no formato XX/XXXX.")
    if not data.documents:
        raise ValueError("Nenhum documento foi analisado.")
    for item in data.documents:
        if data.process_number:
            item.process_number = data.process_number
        if data.modality_number:
            item.modality_number = data.modality_number
        required = {
            "CONTRATADA": item.contractor,
            "segundo CNPJ": item.cnpj,
            "OBJETO": item.object,
            "VALOR": item.value,
            "assinatura digital": item.signature_date,
            "vigência em meses": item.vigencia_meses,
            "nº do processo": item.process_number,
            "nº da modalidade": item.modality_number,
        }
        for label, value in required.items():
            if value in (None, ""):
                raise ValueError(f"{item.filename}: {label} não localizado/preenchido.")


def generate_docx(data: GenerateData) -> bytes:
    from docx import Document

    validate_generate(data)
    template = find_template(data.instrument)
    document = Document(template)
    start = br_date(data.vigencia_inicial)

    for index, item in enumerate(data.documents):
        final = add_months(start, item.vigencia_meses or 0).strftime("%d/%m/%Y")
        if index:
            append_page_break(document._element.body)
            block = Document(template)
            replace_placeholders(block, replacements(data, item, final))
            elements = [
                deepcopy(element)
                for element in block._element.body
                if element.tag != "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sectPr"
            ]
            append_body(document, elements)
        else:
            replace_placeholders(document, replacements(data, item, final))

    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


@app.get("/api/health")
async def health():
    return {"ok": True, "title": app.title}


@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...)) -> list[SupplierData]:
    if not files:
        raise HTTPException(status_code=400, detail="Selecione pelo menos um PDF.")
    return [await analyze_upload(upload) for upload in files]


@app.post("/api/generate")
async def generate(metadata_json: str = Form(...), files: list[UploadFile] = File(...)):
    try:
        metadata = GenerateData.model_validate_json(metadata_json)
        if len(files) != len(metadata.documents):
            raise ValueError("A quantidade de PDFs não corresponde aos dados analisados.")
        output = await run_in_threadpool(generate_docx, metadata)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível gerar o Word: {exc}") from exc

    filename = "Extratos-Ata.docx" if metadata.instrument == "Ata" else "Extratos-Contrato.docx"
    return StreamingResponse(
        io.BytesIO(output),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
