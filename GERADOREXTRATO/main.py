"""API do Gerador de Extrato de Atas e Contratos."""
from __future__ import annotations

import asyncio
import io
import json
import os
import re
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

APP_TITLE = "Gerador de Extrato de Atas e Contratos"
MAX_FILE_SIZE = 50 * 1024 * 1024
DATE_RE = re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
CURRENCY_RE = re.compile(r"R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))", re.I)
NUMBER_SLASH_YEAR_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
CNPJ_RE = re.compile(r"(?<!\d)(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\-]\d{4}[/\-]\d{2})(?!\d)")
MONTHS_RE = re.compile(r"(?<!\d)(\d{1,3})\s*(?:mes|m[eê]s|meses)(?![a-z])", re.I)

ALLOWED_MODALITIES = {
    "Pregão Eletrônico",
    "Pregão Presencial",
    "Dispensa",
    "Concorrência Eletrônica",
    "Concorrência Presencial",
    "Inexigibilidade",
}

MODALITY_PATTERNS = [
    ("Pregão Eletrônico", re.compile(r"preg[aã]o\s+eletr[oô]nico", re.I)),
    ("Pregão Presencial", re.compile(r"preg[aã]o\s+presencial", re.I)),
    ("Concorrência Eletrônica", re.compile(r"concorr[eê]ncia\s+eletr[oô]nica", re.I)),
    ("Concorrência Presencial", re.compile(r"concorr[eê]ncia\s+presencial", re.I)),
    ("Dispensa", re.compile(r"dispensa", re.I)),
    ("Inexigibilidade", re.compile(r"inexigibilidade", re.I)),
]

app = FastAPI(title=APP_TITLE)

origins = [
    "https://danihmorais.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
extra_origins = os.getenv("CORS_ORIGINS", "")
if extra_origins:
    origins.extend(item.strip() for item in extra_origins.split(",") if item.strip())
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_number_slash_year(value: str | None) -> str | None:
    if not value:
        return None
    match = NUMBER_SLASH_YEAR_RE.search(value)
    if not match:
        return None
    return f"{int(match.group(1)):02d}/{match.group(2)}"


def normalize_cnpj(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 14:
        return value.strip()
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"


def parse_date_datetime(date_text: str, time_text: str | None = None) -> datetime:
    day, month, year = map(int, re.split(r"[./-]", date_text))
    hour = minute = second = 0
    if time_text:
        parts = [int(part) for part in time_text.split(":")]
        hour = parts[0]
        minute = parts[1] if len(parts) > 1 else 0
        second = parts[2] if len(parts) > 2 else 0
    return datetime(year, month, day, hour, minute, second)


def extract_signature_field_dates(reader: PdfReader) -> list[tuple[datetime, str]]:
    """Extrai datas do campo criptográfico /M quando o PDF as expõe."""
    found: list[tuple[datetime, str]] = []
    try:
        fields = reader.get_fields() or {}
    except Exception:
        fields = {}

    def walk(value: object) -> None:
        if isinstance(value, dict):
            marker = value.get("/M") or value.get("M")
            if marker:
                text = str(marker)
                match = re.search(r"D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?", text)
                if match:
                    parts = [int(part or 0) for part in match.groups()]
                    try:
                        dt = datetime(*parts)
                        found.append((dt, dt.strftime("%d/%m/%Y")))
                    except ValueError:
                        pass
            for item in value.values():
                if isinstance(item, (dict, list, tuple)):
                    walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(fields)
    return found


def extract_signature_text_dates(text: str) -> list[tuple[datetime, str]]:
    """Localiza a data associada ao marcador de assinatura, evitando datas de validade/emissão próximas."""
    found: list[tuple[datetime, str]] = []
    marker = re.compile(
        r"(?:assinado\s+digitalmente|assinatura\s+digital|documento\s+assinado|assinad[oa]\s+eletronicamente|assinatura\s+eletr[oô]nica|certificado\s+digital|ICP[-\s]?Brasil)",
        re.I,
    )
    date_label = re.compile(r"(?:data|em|às?|assinado|assinatura)\b", re.I)
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if not marker.search(line):
            continue
        candidate_lines = [line]
        if not DATE_RE.search(line):
            for next_index in range(index + 1, min(len(lines), index + 3)):
                next_line = lines[next_index]
                if DATE_RE.search(next_line) and date_label.search(next_line):
                    candidate_lines.append(next_line)
                    break
        block = "\n".join(candidate_lines)
        for date_match in DATE_RE.finditer(block):
            date_text = date_match.group(0)
            after = block[date_match.end():date_match.end() + 24]
            before = block[max(0, date_match.start() - 18):date_match.start()]
            time_match = re.search(r"(?:às?|em)?\s*(\d{1,2}:\d{2}(?::\d{2})?)", after)
            if not time_match:
                time_match = re.search(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*$", before)
            try:
                dt = parse_date_datetime(date_text, time_match.group(1) if time_match else None)
            except ValueError:
                continue
            found.append((dt, date_text.replace("-", "/").replace(".", "/")))
    return found


def extract_last_digital_signature(reader: PdfReader, pages_text: list[str]) -> tuple[str | None, str | None]:
    candidates = extract_signature_field_dates(reader)
    candidates.extend(extract_signature_text_dates("\n".join(pages_text)))
    if not candidates:
        return None, None
    dt, display = max(candidates, key=lambda item: item[0])
    return display, dt.strftime("%Y-%m-%dT%H:%M:%S")


def extract_process_number(text: str) -> str | None:
    patterns = [
        r"(?:n[ºo°]?|n[uú]mero)?\s*(?:do\s+)?processo(?:\s+administrativo)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"processo\s*(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return normalize_number_slash_year(match.group(1))
    return None


def extract_modality(text: str) -> tuple[str | None, str | None]:
    for label, pattern in MODALITY_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        window = text[match.end():match.end() + 160]
        number_match = NUMBER_SLASH_YEAR_RE.search(window)
        number = normalize_number_slash_year(number_match.group(0)) if number_match else None
        return label, number
    return None, None


def extract_modality_number(text: str, detected_modality: str | None) -> str | None:
    if detected_modality:
        modality_regex = {
            "Pregão Eletrônico": r"preg[aã]o\s+eletr[oô]nico",
            "Pregão Presencial": r"preg[aã]o\s+presencial",
            "Concorrência Eletrônica": r"concorr[eê]ncia\s+eletr[oô]nica",
            "Concorrência Presencial": r"concorr[eê]ncia\s+presencial",
            "Dispensa": r"dispensa",
            "Inexigibilidade": r"inexigibilidade",
        }[detected_modality]
        match = re.search(modality_regex + r".{0,180}?((?:n[ºo°]?|n[uú]mero)?\s*\d{1,4}\s*/\s*\d{4})", text, re.I | re.S)
        if match:
            number = NUMBER_SLASH_YEAR_RE.search(match.group(1))
            if number:
                return normalize_number_slash_year(number.group(0))
    patterns = [
        r"(?:n[ºo°]?|n[uú]mero)\s*(?:da\s+)?modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return normalize_number_slash_year(match.group(1))
    return None


def extract_object(text: str) -> str | None:
    match = re.search(
        r"\bOBJETO\s*:\s*(.+?)(?=\n\s*(?:CONTRATADA|CONTRATANTE|CNPJ|VALOR|VIG[EÊ]NCIA|PRAZO)\b|$)",
        text,
        re.I | re.S,
    )
    if match:
        value = normalize_spaces(match.group(1))
        return value[:1500] or None
    match = re.search(r"\bOBJETO\s*:\s*([^\r\n]+)", text, re.I)
    return normalize_spaces(match.group(1))[:1500] if match else None


def extract_contractor(text: str) -> str | None:
    match = re.search(
        r"\bCONTRATADA\s*[:\-]?\s*(.+?)(?=\n\s*(?:CONTRATANTE|CNPJ|CPF|ENDERE[CÇ]O|VALOR|VIG[EÊ]NCIA|PRAZO|OBJETO)\b|$)",
        text,
        re.I | re.S,
    )
    if match:
        value = normalize_spaces(match.group(1))
        return value[:600] or None
    match = re.search(r"\bCONTRATADA\s*[:\-]?\s*([^\r\n]+)", text, re.I)
    return normalize_spaces(match.group(1))[:600] if match else None


def extract_cnpj(text: str) -> str | None:
    matches = CNPJ_RE.findall(text)
    if len(matches) >= 2:
        return normalize_cnpj(matches[1])
    return normalize_cnpj(matches[0]) if matches else None


def extract_value(text: str, last_page_text: str) -> str | None:
    totals = list(re.finditer(r"total\s+do\s+proponente", text, re.I))
    for occurrence in reversed(totals):
        window = text[occurrence.end():occurrence.end() + 1000]
        values = CURRENCY_RE.findall(window)
        if values:
            return f"R$ {values[0]}"
    value_label = re.search(r"VALOR\s*\(\s*R\$\s*\)", last_page_text, re.I)
    if value_label:
        window = last_page_text[value_label.end():value_label.end() + 300]
        values = CURRENCY_RE.findall(window)
        if values:
            return f"R$ {values[0]}"
        generic = re.search(r"(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)", window)
        if generic:
            return f"R$ {generic.group(1)}"
    return None


def extract_vigencia_months(text: str) -> int | None:
    occurrences = list(re.finditer(r"vig[eê]ncia", text, re.I))
    for occurrence in occurrences:
        before = text[max(0, occurrence.start() - 120):occurrence.start()]
        after = text[occurrence.end():occurrence.end() + 220]
        month_match = MONTHS_RE.search(before + " " + after)
        if month_match:
            return int(month_match.group(1))
    return None


def extract_pdf(data: bytes, filename: str) -> dict:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise ValueError("PDF protegido por senha; não foi possível ler o conteúdo.")
    pages_text = [(page.extract_text() or "") for page in reader.pages]
    text = "\n".join(pages_text)
    if not normalize_spaces(text):
        raise ValueError("Não foi possível extrair texto do PDF. O arquivo pode ser escaneado como imagem.")

    signature_date, signature_datetime = extract_last_digital_signature(reader, pages_text)
    detected_modality, modality_number = extract_modality(text)
    result = {
        "filename": filename,
        "process_number": extract_process_number(text),
        "modality_number": extract_modality_number(text, detected_modality) or modality_number,
        "detected_modality": detected_modality,
        "object": extract_object(text),
        "contractor": extract_contractor(text),
        "cnpj": extract_cnpj(text),
        "value": extract_value(text, pages_text[-1] if pages_text else ""),
        "signature_date": signature_date,
        "signature_datetime": signature_datetime,
        "vigencia_meses": extract_vigencia_months(text),
        "error": None,
    }
    missing = [
        label
        for label, key in [
            ("assinatura digital", "signature_date"),
            ("nº do processo", "process_number"),
            ("nº da modalidade", "modality_number"),
            ("objeto", "object"),
            ("contratada", "contractor"),
            ("CNPJ", "cnpj"),
            ("valor", "value"),
            ("vigência em meses", "vigencia_meses"),
        ]
        if not result[key]
    ]
    if missing:
        result["error"] = "Não localizado automaticamente: " + ", ".join(missing) + "."
    return result


def parse_br_date(value: str) -> date:
    match = DATE_RE.fullmatch(value.strip())
    if not match:
        raise ValueError("Data inválida. Use DD/MM/AAAA.")
    day, month, year = map(int, match.groups())
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise ValueError("Data inválida. Use DD/MM/AAAA.") from exc


def add_months(base: date, months: int) -> date:
    total = base.year * 12 + (base.month - 1) + months
    year = total // 12
    month = total % 12 + 1
    if year < 1 or year > 9999:
        raise ValueError("Data de vigência final fora do intervalo suportado.")
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    last_day = (next_month - date.resolution).day
    return date(year, month, min(base.day, last_day))


def format_br_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def replace_in_paragraph(paragraph_element, replacements: dict[str, str]) -> None:
    for token, replacement in replacements.items():
        while True:
            text_nodes = [node for node in paragraph_element.iter(qn("w:t")) if node.text]
            if not text_nodes:
                break
            full_text = "".join(node.text or "" for node in text_nodes)
            index = full_text.find(token)
            if index < 0:
                break

            pos = 0
            first = last = None
            first_offset = last_offset = 0
            for node_index, node in enumerate(text_nodes):
                node_text = node.text or ""
                node_end = pos + len(node_text)
                if first is None and pos <= index < node_end:
                    first = node_index
                    first_offset = index - pos
                end_index = index + len(token)
                if pos < end_index <= node_end:
                    last = node_index
                    last_offset = end_index - pos
                    break
                pos = node_end
            if first is None or last is None:
                break

            first_text = text_nodes[first].text or ""
            last_text = text_nodes[last].text or ""
            if first == last:
                text_nodes[first].text = first_text[:first_offset] + replacement + first_text[last_offset:]
            else:
                text_nodes[first].text = first_text[:first_offset] + replacement
                for idx in range(first + 1, last):
                    text_nodes[idx].text = ""
                text_nodes[last].text = last_text[last_offset:]


def replace_in_container(container, replacements: dict[str, str]) -> None:
    for paragraph in container.iter(qn("w:p")):
        replace_in_paragraph(paragraph, replacements)


def make_next_page_break(template_sect_pr):
    paragraph = OxmlElement("w:p")
    ppr = OxmlElement("w:pPr")
    sect_pr = deepcopy(template_sect_pr) if template_sect_pr is not None else OxmlElement("w:sectPr")
    type_node = sect_pr.find(qn("w:type"))
    if type_node is None:
        type_node = OxmlElement("w:type")
        sect_pr.insert(0, type_node)
    type_node.set(qn("w:val"), "nextPage")
    ppr.append(sect_pr)
    paragraph.append(ppr)
    return paragraph


def append_before_sectpr(body, element) -> None:
    sect_pr = body.sectPr
    if sect_pr is not None:
        sect_pr.addprevious(element)
    else:
        body.append(element)


def build_document(metadata: dict) -> bytes:
    instrument = str(metadata.get("instrument") or "Ata")
    modality = str(metadata.get("modality") or "")
    sector = str(metadata.get("sector") or "").strip()
    vigencia_inicial = str(metadata.get("vigencia_inicial") or "").strip()
    data_extrato = str(metadata.get("data_extrato") or "").strip()
    process_override = normalize_number_slash_year(str(metadata.get("process_number") or ""))
    modality_override = normalize_number_slash_year(str(metadata.get("modality_number") or ""))
    documents = metadata.get("documents")

    if instrument not in {"Ata", "Contrato"}:
        raise ValueError("Instrumento inválido.")
    if modality not in ALLOWED_MODALITIES:
        raise ValueError("Modalidade inválida.")
    if not sector:
        raise ValueError("Informe o setor.")
    initial_date = parse_br_date(vigencia_inicial)
    parse_br_date(data_extrato)
    if not isinstance(documents, list) or not documents:
        raise ValueError("Nenhum fornecedor foi informado.")

    template_path = Path(__file__).resolve().parent / "modelo" / "EXTRATO.docx"
    if not template_path.exists():
        raise FileNotFoundError("Modelo/modelo EXTRATO.docx não encontrado no servidor.")

    document = Document(str(template_path))
    template_children = [
        deepcopy(child)
        for child in document.element.body
        if child.tag != qn("w:sectPr")
    ]
    template_sect_pr = deepcopy(document.element.body.sectPr) if document.element.body.sectPr is not None else None

    for position, item in enumerate(documents):
        process_number = process_override or normalize_number_slash_year(str(item.get("process_number") or ""))
        modality_number = modality_override or normalize_number_slash_year(str(item.get("modality_number") or ""))
        months = int(item.get("vigencia_meses") or 0)
        supplier_name = item.get("filename") or "fornecedor"
        if months <= 0:
            raise ValueError(f"Vigência inválida para {supplier_name}.")
        if not process_number:
            raise ValueError(f"Nº do processo não localizado para {supplier_name}.")
        if not modality_number:
            raise ValueError(f"Nº da modalidade não localizado para {supplier_name}.")
        if not item.get("signature_date"):
            raise ValueError(f"Assinatura digital não localizada para {supplier_name}.")

        final_date = add_months(initial_date, months)
        replacements = {
            "{{DATA.ASS}}": str(item.get("signature_date") or ""),
            "{{MODALIDADE}}": modality,
            "{{INSTRUMENTO}}": instrument,
            "{{N.PROCESSO}}": process_number,
            "{{N.MODALIDADE}}": modality_number,
            "{{OBJETO}}": str(item.get("object") or ""),
            "{{SETOR}}": sector,
            "{{CONTRATADA}}": str(item.get("contractor") or ""),
            "{{CNPJ}}": str(item.get("cnpj") or ""),
            "{{VALOR}}": str(item.get("value") or ""),
            "{{VIG.INICIAL}}": format_br_date(initial_date),
            "{{VIG.FINAL}}": format_br_date(final_date),
            "{{DATA.EXTRATO}}": data_extrato,
        }

        if position == 0:
            replace_in_container(document.element.body, replacements)
        else:
            append_before_sectpr(document.element.body, make_next_page_break(template_sect_pr))
            for child in template_children:
                clone = deepcopy(child)
                replace_in_container(clone, replacements)
                append_before_sectpr(document.element.body, clone)

    output = io.BytesIO()
    document.save(output)
    output.seek(0)
    return output.getvalue()


async def read_upload(upload: UploadFile) -> bytes:
    if (upload.filename or "").lower().split(".")[-1:] != ["pdf"]:
        raise HTTPException(status_code=400, detail=f"{upload.filename or 'Arquivo'}: envie apenas PDF.")
    data = await upload.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"{upload.filename}: arquivo maior que 50 MB.")
    return data


async def analyze_one(upload: UploadFile) -> dict:
    filename = upload.filename or "documento.pdf"
    try:
        data = await read_upload(upload)
        return await run_in_threadpool(extract_pdf, data, filename)
    except HTTPException:
        raise
    except Exception as exc:
        return {
            "filename": filename,
            "process_number": None,
            "modality_number": None,
            "detected_modality": None,
            "object": None,
            "contractor": None,
            "cnpj": None,
            "value": None,
            "signature_date": None,
            "signature_datetime": None,
            "vigencia_meses": None,
            "error": str(exc),
        }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": APP_TITLE}


@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Selecione pelo menos um PDF.")
    return await asyncio.gather(*(analyze_one(upload) for upload in files))


@app.post("/api/generate")
async def generate(metadata_json: str = Form(...)):
    try:
        metadata = json.loads(metadata_json)
        content = await run_in_threadpool(build_document, metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Metadados inválidos.") from exc
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível gerar o Word: {exc}") from exc

    instrument = metadata.get("instrument") or "Ata"
    filename = "Extratos-Ata.docx" if instrument == "Ata" else "Extratos-Contrato.docx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
