"""API do Gerador de Extrato de Atas e Contratos."""
from __future__ import annotations

import asyncio
import io
import json
import os
import re
import tempfile
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

DATE_RE = re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{4})[./-](\d{2})[./-](\d{2})(?!\d)")
TIME_RE = re.compile(r"\b(\d{1,2}:\d{2}(?::\d{2})?)\b")
CURRENCY_RE = re.compile(
    r"(?<![\d.,])R\$?\s*"
    r"([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))"
    r"(?![\d.,])",
    re.I,
)
PLAIN_VALUE_RE = re.compile(
    r"(?<![\d.,])(?:[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+,[0-9]{2})(?![\d.,])"
)
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
CNPJ_RE = re.compile(
    r"(?<!\d)(?:\d{2}\s*[./-]?\s*\d{3}\s*[./-]?\s*\d{3}\s*/\s*\d{4}\s*[./-]?\s*\d{2}|\d{14})(?!\d)"
)
MONTHS_RE = re.compile(
    r"(?<!\d)(\d{1,3})\s*(?:\(\s*[^)]*\)\s*)?(?:mes(?:es)?|m[eê]s(?:es)?)(?![a-z])",
    re.I,
)
YEARS_RE = re.compile(
    r"(?<!\d)(\d{1,2})\s*(?:\(\s*[^)]*\)\s*)?(?:ano(?:s)?)(?![a-z])",
    re.I,
)
INSTRUMENT_RE = re.compile(r"(?<!\w)(ATA|CONTRATO)(?!\w)", re.I)
INSTRUMENT_NUMBER_RE = re.compile(
    r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    re.I,
)
MODALITIES = [
    ("Pregão Eletrônico", r"preg[aã]o\s+eletr[oô]nico"),
    ("Pregão Presencial", r"preg[aã]o\s+presencial"),
    ("Concorrência Eletrônica", r"concorr[eê]ncia\s+eletr[oô]nica"),
    ("Concorrência Presencial", r"concorr[eê]ncia\s+presencial"),
    ("Dispensa", r"dispensa"),
    ("Inexigibilidade", r"inexigibilidade"),
]
HEADER_MARGIN_PT = 84
FOOTER_MARGIN_PT = 72
LINE_Y_TOLERANCE_PT = 2.5
SIGNATURE_MARKER_RE = re.compile(
    r"assinado\s+digitalmente|assinatura\s+digital|documento\s+assinado|"
    r"assinad[oa]\s+eletronicamente|assinatura\s+eletr[oô]nica|certificado\s+digital|"
    r"ICP[-\s]?Brasil",
    re.I,
)

app = FastAPI(title="Gerador de Extrato de Atas e Contratos")
origins = [
    "https://danihmorais.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
origins += [x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def spaces(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def number(value: str | None) -> str | None:
    m = NUMBER_RE.search(value or "")
    if not m:
        return None
    prefix = str(int(m.group(1)))
    return f"{int(prefix):02d}/{m.group(2)}" if len(prefix) <= 2 else f"{prefix}/{m.group(2)}"


def cnpj(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 14:
        return (value or "").strip()
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"


def _valid_cnpj(value: str) -> bool:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 14 or len(set(digits)) == 1:
        return False
    weights_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    rest = sum(int(a) * b for a, b in zip(digits[:12], weights_1)) % 11
    check_1 = 0 if rest < 2 else 11 - rest
    weights_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    rest = sum(int(a) * b for a, b in zip(digits[:13], weights_2)) % 11
    check_2 = 0 if rest < 2 else 11 - rest
    return digits[12] == str(check_1) and digits[13] == str(check_2)


def _cnpj_candidates(text: str) -> list[str]:
    return [m.group() for m in CNPJ_RE.finditer(text or "") if _valid_cnpj(m.group())]


def dt_from(value: str, time_value: str | None = None) -> datetime:
    day, month, year = map(int, re.split(r"[./-]", value))
    hour = minute = second = 0
    if time_value:
        parts = list(map(int, time_value.split(":")))
        hour = parts[0]
        minute = parts[1] if len(parts) > 1 else 0
        second = parts[2] if len(parts) > 2 else 0
    return datetime(year, month, day, hour, minute, second)


def _page_body_lines(page) -> list[str]:
    height = float(page.mediabox.height)
    chunks: list[tuple[float, float, str]] = []

    def visitor(text, cm, tm, font_dict, font_size):
        if not text or not text.strip():
            return
        x = float(tm[4])
        y = float(tm[5])
        if y >= height - HEADER_MARGIN_PT or y <= FOOTER_MARGIN_PT:
            return
        for part in re.split(r"\r?\n", text):
            part = spaces(part)
            if part:
                chunks.append((y, x, part))

    try:
        page.extract_text(visitor_text=visitor)
    except (TypeError, ValueError):
        return []
    if not chunks:
        return []

    rows: list[list[Any]] = []
    for y, x, part in sorted(chunks, key=lambda item: (-item[0], item[1])):
        if rows and abs(rows[-1][0] - y) <= LINE_Y_TOLERANCE_PT:
            rows[-1][1].append((x, part))
        else:
            rows.append([y, [(x, part)]])

    gaps = [rows[i][0] - rows[i + 1][0] for i in range(len(rows) - 1)]
    normal_gaps = [gap for gap in gaps if gap > LINE_Y_TOLERANCE_PT]
    normal_gap = sorted(normal_gaps)[len(normal_gaps) // 2] if normal_gaps else 12.0
    blank_gap = max(14.0, normal_gap * 1.8)

    lines: list[str] = []
    for i, (y, parts) in enumerate(rows):
        if i and rows[i - 1][0] - y >= blank_gap:
            lines.append("")
        line = spaces(" ".join(text for _, text in sorted(parts, key=lambda item: item[0])))
        if line:
            lines.append(line)
    return lines


def body_text(reader: PdfReader) -> tuple[str, list[str]]:
    pages = [_page_body_lines(page) for page in reader.pages]
    page_texts = ["\n".join(lines) for lines in pages]
    return "\n\n".join(page_texts), page_texts


def raw_text(reader: PdfReader) -> tuple[str, list[str]]:
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    return "\n\n".join(pages), pages


def _walk_pdf_object(value: Any, visitor, seen: set[int]) -> None:
    try:
        if hasattr(value, "get_object"):
            value = value.get_object()
    except Exception:
        return
    if value is None:
        return
    marker_id = id(value)
    if marker_id in seen:
        return
    if isinstance(value, (dict, list, tuple)):
        seen.add(marker_id)
    if isinstance(value, dict):
        visitor(value)
        for child in value.values():
            _walk_pdf_object(child, visitor, seen)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _walk_pdf_object(child, visitor, seen)


def _pdf_date(value: Any) -> datetime | None:
    text = str(value or "")
    m = re.search(r"D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?", text)
    if m:
        try:
            parts = [int(item or 0) for item in m.groups()]
            return datetime(*parts)
        except ValueError:
            return None
    return None


def _date_candidates(block: str) -> list[tuple[datetime, str]]:
    found: list[tuple[datetime, str]] = []
    for match in DATE_RE.finditer(block or ""):
        time_match = TIME_RE.search(block[match.end() : match.end() + 30])
        try:
            dt = dt_from(match.group(), time_match.group(1) if time_match else None)
            found.append((dt, dt.strftime("%d/%m/%Y")))
        except ValueError:
            pass
    for match in ISO_DATE_RE.finditer(block or ""):
        time_match = TIME_RE.search(block[match.end() : match.end() + 30])
        try:
            iso = match.group()
            dt = datetime.fromisoformat(iso.replace("/", "-").replace(".", "-") )
            if time_match:
                parts = list(map(int, time_match.group(1).split(":")))
                dt = dt.replace(hour=parts[0], minute=parts[1], second=parts[2] if len(parts) > 2 else 0)
            found.append((dt, dt.strftime("%d/%m/%Y")))
        except ValueError:
            pass
    return found


def signature_dates(reader: PdfReader, pages: list[str]) -> tuple[str | None, str | None]:
    found: list[tuple[datetime, str]] = []

    def visitor(obj: dict) -> None:
        for key in ("/M", "M"):
            dt = _pdf_date(obj.get(key))
            if dt:
                found.append((dt, dt.strftime("%d/%m/%Y")))

    roots: list[Any] = []
    try:
        roots.append(reader.get_fields() or {})
    except Exception:
        pass
    try:
        roots.append(reader.trailer.get("/Root"))
    except Exception:
        pass
    for page in reader.pages:
        try:
            roots.append(page.get("/Annots") or [])
        except Exception:
            pass
    seen: set[int] = set()
    for root in roots:
        _walk_pdf_object(root, visitor, seen)

    for page_text in pages:
        lines = page_text.splitlines()
        for i, line in enumerate(lines):
            if not SIGNATURE_MARKER_RE.search(line):
                continue
            start = max(0, i - 2)
            end = min(len(lines), i + 7)
            block = " ".join(part.strip() for part in lines[start:end] if part.strip())
            found.extend(_date_candidates(block))

    if not found:
        return None, None
    dt, value = max(found, key=lambda item: item[0])
    return value, dt.strftime("%Y-%m-%dT%H:%M:%S")


def process(text: str) -> str | None:
    patterns = [
        r"processo\s+(?:administrativo\s+)?(?:n[ºo°]?|n[uú]mero)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})\s*(?:do\s+)?processo",
    ]
    for pattern in patterns:
        match = re.search(pattern, text or "", re.I)
        if match:
            return number(match.group(1))
    return None


def modality(text: str) -> tuple[str | None, str | None]:
    found: list[tuple[int, str, str | None]] = []
    for label, pattern in MODALITIES:
        match = re.search(pattern, text or "", re.I)
        if not match:
            continue
        window = (text or "")[match.end() : match.end() + 260]
        number_match = NUMBER_RE.search(window)
        found.append((match.start(), label, number(number_match.group()) if number_match else None))
    if not found:
        return None, None
    _, label, modality_num = min(found, key=lambda item: item[0])
    return label, modality_num


def modality_number(text: str, detected: str | None) -> str | None:
    if detected:
        pattern = dict(MODALITIES)[detected]
        match = re.search(
            pattern + r".{0,260}?(?:n[ºo°]?|n[uú]mero)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
            text or "",
            re.I | re.S,
        )
        if match:
            return number(match.group(1))
    for pattern in (
        r"(?:n[ºo°]?|n[uú]mero)\s*(?:da\s+)?modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ):
        match = re.search(pattern, text or "", re.I)
        if match:
            return number(match.group(1))
    return None


def instrument_info(text: str) -> tuple[str | None, str | None]:
    """Retorna o primeiro ATA/CONTRATO do corpo e o número associado à mesma região textual."""
    lines = (text or "").splitlines()
    for index, line in enumerate(lines):
        match = INSTRUMENT_RE.search(line)
        if not match:
            continue
        instrument_value = match.group(1).capitalize()
        candidates = [
            line[match.end() : match.end() + 220],
            line[max(0, match.start() - 180) : match.start()],
        ]
        for offset in (1, 2):
            if index + offset < len(lines):
                candidates.append(lines[index + offset][:220])
            if index - offset >= 0:
                candidates.append(lines[index - offset][-220:])

        for candidate in candidates:
            labeled = INSTRUMENT_NUMBER_RE.search(candidate)
            if labeled:
                return instrument_value, number(labeled.group(1))
            plain = NUMBER_RE.search(candidate)
            if plain:
                return instrument_value, number(plain.group())
        return instrument_value, None
    return None, None


def obj(text: str) -> str | None:
    lines = (text or "").splitlines()
    for index, line in enumerate(lines):
        match = re.match(r"^\s*OBJETO\s*[:\-]?\s*(.*)$", line, re.I)
        if not match:
            continue
        parts: list[str] = []
        first = spaces(match.group(1))
        if first:
            parts.append(first)
        for next_line in lines[index + 1 :]:
            if not next_line.strip():
                break
            parts.append(spaces(next_line))
        return spaces(" ".join(parts)) or None
    return None


def contractor(text: str) -> str | None:
    for label in ("CONTRATADA", "CONTRATADO"):
        match = re.search(rf"^\s*{label}\s*[:\-]?\s*([^\r\n]+)", text or "", re.I | re.M)
        if match:
            return spaces(match.group(1))
    return None


def cnpj_after_contractor(text: str) -> str | None:
    match = re.search(
        r"^\s*(?:CONTRATADA|CONTRATADO)\s*[:\-]?\s*([^\r\n]+)",
        text or "",
        re.I | re.M,
    )
    if not match:
        return None
    candidate = CNPJ_RE.search((text or "")[match.start(1) : match.start(1) + 500])
    return candidate.group() if candidate and _valid_cnpj(candidate.group()) else None


def _money_after_label(text: str) -> str | None:
    match = CURRENCY_RE.search(text or "")
    if match:
        return f"R$ {match.group(1)}"
    match = PLAIN_VALUE_RE.search(text or "")
    return f"R$ {match.group()}" if match else None


def value(text: str) -> str | None:
    text = text or ""
    lines = text.splitlines()
    label_re = re.compile(
        r"(?:total\s+do\s+proponente|valor\s+total|valor\s*\(\s*r\s*\$\s*\))",
        re.I,
    )
    for index in range(len(lines) - 1, -1, -1):
        matches = list(label_re.finditer(lines[index]))
        for match in reversed(matches):
            candidate = _money_after_label(lines[index][match.end() :])
            if candidate:
                return candidate
            candidate = _money_after_label(" ".join(lines[index + 1 : index + 8])[:280])
            if candidate:
                return candidate
    for match in reversed(list(label_re.finditer(text))):
        candidate = _money_after_label(text[match.end() : match.end() + 280])
        if candidate:
            return candidate
    return None


def months(text: str) -> int | None:
    text = text or ""
    for match in reversed(list(re.finditer(r"vig[eê]ncia", text, re.I))):
        window = text[match.end() : match.end() + 500]
        month_match = MONTHS_RE.search(window)
        if month_match:
            return int(month_match.group(1))
        year_match = YEARS_RE.search(window)
        if year_match:
            return int(year_match.group(1)) * 12
    return None


def extract(data: bytes, filename: str) -> dict[str, Any]:
    reader = PdfReader(io.BytesIO(data))
    text, pages = body_text(reader)
    raw, raw_pages = raw_text(reader)
    searchable = text if spaces(text) else raw
    if not spaces(searchable):
        raise ValueError("Não foi possível extrair texto do PDF. O arquivo pode ser escaneado como imagem.")

    signature_date, signature_datetime = signature_dates(reader, raw_pages)
    if not signature_date:
        signature_date, signature_datetime = signature_dates(reader, pages)

    mod, modality_num = modality(text)
    if not mod and raw:
        mod, modality_num = modality(raw)

    inst, inst_number = instrument_info(text)
    if not inst and raw:
        inst, inst_number = instrument_info(raw)

    contractor_name = contractor(text) or contractor(raw)
    all_cnpjs = _cnpj_candidates(raw) or _cnpj_candidates(text)
    selected_cnpj = all_cnpjs[1] if len(all_cnpjs) >= 2 else (all_cnpjs[0] if all_cnpjs else None)
    if not selected_cnpj:
        selected_cnpj = cnpj_after_contractor(text) or cnpj_after_contractor(raw)

    result = {
        "filename": filename,
        "process_number": process(text) or process(raw),
        "modality_number": modality_number(text, mod) or modality_number(raw, mod) or modality_num,
        "detected_modality": mod,
        "modality": mod,
        "detected_instrument": inst,
        "instrument": inst,
        "instrument_number": inst_number,
        "object": obj(text) or obj(raw),
        "contractor": contractor_name,
        "cnpj": cnpj(selected_cnpj) if selected_cnpj else None,
        "value": value(text) or value(raw),
        "signature_date": signature_date,
        "signature_datetime": signature_datetime,
        "vigencia_meses": months(text) or months(raw),
        "error": None,
    }
    missing = [
        label
        for label, key in [
            ("assinatura digital", "signature_date"),
            ("nº do processo", "process_number"),
            ("nº da modalidade", "modality_number"),
            ("modalidade", "modality"),
            ("instrumento", "instrument"),
            ("nº do instrumento", "instrument_number"),
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


def parse_date(value: str) -> date:
    match = DATE_RE.fullmatch((value or "").strip())
    if not match:
        raise ValueError("Data inválida. Use DD/MM/AAAA.")
    try:
        return date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
    except ValueError as exc:
        raise ValueError("Data inválida. Use DD/MM/AAAA.") from exc


def add_months(base: date, months_count: int) -> date:
    total = base.year * 12 + base.month - 1 + months_count
    year = total // 12
    month = total % 12 + 1
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    last_day = (next_month - date.resolution).day
    return date(year, month, min(base.day, last_day))


def _formatted_replacement(run, value: Any) -> str:
    result = str(value or "")
    rpr = run.find(qn("w:rPr"))
    if rpr is None:
        return result
    caps = rpr.find(qn("w:caps"))
    small_caps = rpr.find(qn("w:smallCaps"))
    caps_on = caps is not None and caps.get(qn("w:val"), "1") not in ("0", "false", "off")
    small_caps_on = small_caps is not None and small_caps.get(qn("w:val"), "1") not in ("0", "false", "off")
    return result.upper() if caps_on or small_caps_on else result


def replace_element(element, replacements: dict[str, Any]) -> None:
    for paragraph in element.iter(qn("w:p")):
        for token, replacement in replacements.items():
            while True:
                text_nodes = [node for node in paragraph.iter(qn("w:t")) if node.text is not None]
                full_text = "".join(node.text or "" for node in text_nodes)
                start = full_text.find(token)
                if start < 0:
                    break
                end = start + len(token)
                position = 0
                first_index = last_index = None
                first_offset = last_offset = 0
                for index, node in enumerate(text_nodes):
                    node_text = node.text or ""
                    node_end = position + len(node_text)
                    if first_index is None and position <= start < node_end:
                        first_index = index
                        first_offset = start - position
                    if position < end <= node_end:
                        last_index = index
                        last_offset = end - position
                        break
                    position = node_end
                if first_index is None or last_index is None:
                    break
                source_run = text_nodes[first_index].getparent()
                formatted = _formatted_replacement(source_run, replacement)
                if first_index == last_index:
                    original = text_nodes[first_index].text or ""
                    text_nodes[first_index].text = original[:first_offset] + formatted + original[last_offset:]
                    continue
                first_text = text_nodes[first_index].text or ""
                text_nodes[first_index].text = first_text[:first_offset] + formatted
                for middle_index in range(first_index + 1, last_index):
                    text_nodes[middle_index].text = ""
                last_text = text_nodes[last_index].text or ""
                text_nodes[last_index].text = last_text[last_offset:]


def replace_document_placeholders(document: Document, replacements: dict[str, Any]) -> None:
    replace_element(document.element.body, replacements)
    for section in document.sections:
        for part in (section.header, section.first_page_header, section.even_page_header, section.footer, section.first_page_footer, section.even_page_footer):
            replace_element(part._element, replacements)


def break_next(section_properties):
    paragraph = OxmlElement("w:p")
    paragraph_properties = OxmlElement("w:pPr")
    section = deepcopy(section_properties) if section_properties is not None else OxmlElement("w:sectPr")
    section_type = section.find(qn("w:type"))
    if section_type is None:
        section_type = OxmlElement("w:type")
        section.insert(0, section_type)
    section_type.set(qn("w:val"), "nextPage")
    paragraph_properties.append(section)
    paragraph.append(paragraph_properties)
    return paragraph


def generate(meta: dict[str, Any]) -> tuple[bytes, list[str]]:
    initial = parse_date(meta["vigencia_inicial"])
    parse_date(meta["data_extrato"])
    documents = meta.get("documents") or []
    if not documents:
        raise ValueError("Nenhum documento foi enviado para geração.")

    model_path = Path(__file__).parent / "modelo" / "EXTRATO.docx"
    if not model_path.exists():
        raise ValueError("Modelo EXTRATO.docx não encontrado.")

    document = Document(str(model_path))
    body = document.element.body
    section_properties = body.sectPr
    templates = [deepcopy(child) for child in body if child.tag != qn("w:sectPr")]
    instruments: list[str] = []

    for index, item in enumerate(documents):
        required = [
            ("signature_date", "Assinatura digital"),
            ("process_number", "Nº do processo"),
            ("modality_number", "Nº da modalidade"),
            ("modality", "Modalidade"),
            ("instrument", "Instrumento"),
            ("instrument_number", "Nº do instrumento"),
        ]
        for key, label in required:
            if not item.get(key):
                raise ValueError(f"{label} não localizado para {item.get('filename', 'fornecedor')}.")

        months_count = int(item.get("vigencia_meses") or 0)
        if months_count <= 0:
            raise ValueError(f"Vigência inválida para {item.get('filename', 'fornecedor')}.")
        final = add_months(initial, months_count)
        instrument_value = item["instrument"]
        instruments.append(instrument_value)
        process_number_value = number(item.get("process_number")) or item.get("process_number", "")
        modality_number_value = number(item.get("modality_number")) or item.get("modality_number", "")
        instrument_number_value = number(item.get("instrument_number")) or item.get("instrument_number", "")
        replacements = {
            "{{DATA.ASS}}": item.get("signature_date", ""),
            "{{MODALIDADE}}": item.get("modality", ""),
            "{{INSTRUMENTO}}": instrument_value,
            "{{N.INST}}": instrument_number_value,
            "{{N.PROC}}": process_number_value,
            "{{N.PROCESSO}}": process_number_value,
            "{{N.MODALIDADE}}": modality_number_value,
            "{{OBJETO}}": item.get("object", ""),
            "{{SETOR}}": meta.get("sector", ""),
            "{{CONTRATADA}}": item.get("contractor", ""),
            "{{CNPJ}}": item.get("cnpj", ""),
            "{{VALOR}}": item.get("value", ""),
            "{{VIG.INICIAL}}": initial.strftime("%d/%m/%Y"),
            "{{VIG.FINAL}}": final.strftime("%d/%m/%Y"),
            "{{DATA.EXTRATO}}": meta.get("data_extrato", ""),
        }
        if index == 0:
            replace_document_placeholders(document, replacements)
        else:
            insert_at = body.index(section_properties)
            body.insert(insert_at, break_next(section_properties))
            insert_at = body.index(section_properties)
            for template in templates:
                clone = deepcopy(template)
                replace_element(clone, replacements)
                body.insert(insert_at, clone)
                insert_at += 1

    output = io.BytesIO()
    document.save(output)
    output.seek(0)
    return output.getvalue(), instruments


def convert_docx_to_pdf(docx_data: bytes) -> bytes:
    """Converte DOCX para PDF usando o motor de layout do Aspose.Words."""
    try:
        import aspose.words as aw
    except ImportError as exc:
        raise ValueError("A biblioteca 'aspose-words' não está instalada. Execute pip install -r requirements.txt.") from exc

    license_path = os.getenv("ASPOSE_WORDS_LICENSE", "").strip()
    if license_path:
        license_file = Path(license_path)
        if not license_file.exists():
            raise ValueError(f"ASPOSE_WORDS_LICENSE aponta para um arquivo inexistente: {license_path}")
        try:
            aw.License().set_license(str(license_file))
        except Exception as exc:
            raise ValueError(f"Não foi possível aplicar a licença do Aspose.Words: {exc}") from exc

    with tempfile.TemporaryDirectory(prefix="geradorextrato-") as tmp_dir:
        workdir = Path(tmp_dir)
        source = workdir / "extrato.docx"
        target = workdir / "extrato.pdf"
        source.write_bytes(docx_data)
        try:
            doc = aw.Document(str(source))
            font_dir = os.getenv("ASPOSE_FONT_DIR", "").strip()
            if font_dir and Path(font_dir).exists():
                doc.font_settings.set_fonts_folder(font_dir, True)
            doc.save(str(target))
        except Exception as exc:
            raise ValueError(f"Falha ao converter o extrato para PDF com Aspose.Words: {exc}") from exc
        if not target.exists() or target.stat().st_size == 0:
            raise ValueError("O Aspose.Words não produziu um PDF válido.")
        return target.read_bytes()


def export_name(instruments: list[str], extension: str) -> str:
    unique = set(instruments)
    if unique == {"Ata"}:
        base = "Extratos-Ata"
    elif unique == {"Contrato"}:
        base = "Extratos-Contrato"
    else:
        base = "Extratos-Ata-e-Contrato"
    return f"{base}.{extension}"


@app.get("/api/health")
@app.get("/geradorextrato/api/health")
async def health():
    return {"status": "ok", "pdf_converter": "aspose-words"}


@app.post("/api/analyze")
@app.post("/geradorextrato/api/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    async def one(upload: UploadFile) -> dict[str, Any]:
        data = await upload.read()
        try:
            return await run_in_threadpool(extract, data, upload.filename or "documento.pdf")
        except Exception as exc:
            return {
                "filename": upload.filename or "documento.pdf",
                "process_number": None,
                "modality_number": None,
                "detected_modality": None,
                "modality": None,
                "detected_instrument": None,
                "instrument": None,
                "instrument_number": None,
                "object": None,
                "contractor": None,
                "cnpj": None,
                "value": None,
                "signature_date": None,
                "signature_datetime": None,
                "vigencia_meses": None,
                "error": str(exc),
            }

    return await asyncio.gather(*(one(upload) for upload in files))


async def _generate_response(metadata_json: str, as_pdf: bool):
    try:
        metadata = json.loads(metadata_json)
        docx_data, instruments = await run_in_threadpool(generate, metadata)
        if as_pdf:
            data = await run_in_threadpool(convert_docx_to_pdf, docx_data)
            media_type = "application/pdf"
            extension = "pdf"
        else:
            data = docx_data
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            extension = "docx"
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{export_name(instruments, extension)}"'},
    )


@app.post("/api/generate-docx")
@app.post("/geradorextrato/api/generate-docx")
async def generate_docx_api(metadata_json: str = Form(...)):
    return await _generate_response(metadata_json, as_pdf=False)


@app.post("/api/generate")
@app.post("/geradorextrato/api/generate")
async def generate_api(metadata_json: str = Form(...)):
    return await _generate_response(metadata_json, as_pdf=True)
