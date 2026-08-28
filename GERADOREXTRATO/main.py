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

DATE_RE = re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
CURRENCY_RE = re.compile(r"R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))", re.I)
PLAIN_VALUE_RE = re.compile(r"(?<![\d.,])(?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+),[0-9]{2}(?![\d.,])")
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
CNPJ_RE = re.compile(r"(?<!\d)(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\-]\d{4}[/\-]\d{2})(?!\d)")
MONTHS_RE = re.compile(r"(?<!\d)(\d{1,3})\s*(?:mes|m[eê]s|meses)(?![a-z])", re.I)
INSTRUMENT_RE = re.compile(r"(?<!\w)(ATA|CONTRATO)(?!\w)", re.I)
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

app = FastAPI(title="Gerador de Extrato de Atas e Contratos")
origins = ["https://danihmorais.github.io", "http://localhost:5173", "http://127.0.0.1:5173"]
origins += [x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


def spaces(v):
    return re.sub(r"\s+", " ", v or "").strip()


def number(v):
    m = NUMBER_RE.search(v or "")
    return f"{int(m.group(1)):02d}/{m.group(2)}" if m else None


def cnpj(v):
    d = re.sub(r"\D", "", v or "")
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else (v or "").strip()


def dt_from(d, t=None):
    day, month, year = map(int, re.split(r"[./-]", d))
    h = m = s = 0
    if t:
        p = list(map(int, t.split(":")))
        h = p[0]
        m = p[1] if len(p) > 1 else 0
        s = p[2] if len(p) > 2 else 0
    return datetime(year, month, day, h, m, s)


def _page_body_lines(page):
    height = float(page.mediabox.height)
    chunks = []

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
    except TypeError:
        return []
    if not chunks:
        return []

    rows = []
    for y, x, part in sorted(chunks, key=lambda item: (-item[0], item[1])):
        if rows and abs(rows[-1][0] - y) <= LINE_Y_TOLERANCE_PT:
            rows[-1][1].append((x, part))
        else:
            rows.append([y, [(x, part)]])

    gaps = [rows[i][0] - rows[i + 1][0] for i in range(len(rows) - 1)]
    positive_gaps = [g for g in gaps if g > LINE_Y_TOLERANCE_PT]
    normal_gap = sorted(positive_gaps)[len(positive_gaps) // 2] if positive_gaps else 12.0
    blank_gap = max(14.0, normal_gap * 1.8)
    lines = []
    for i, (y, parts) in enumerate(rows):
        if i and rows[i - 1][0] - y >= blank_gap:
            lines.append("")
        line = spaces(" ".join(text for _, text in sorted(parts, key=lambda item: item[0])))
        if line:
            lines.append(line)
    return lines


def body_text(reader):
    pages = [_page_body_lines(page) for page in reader.pages]
    text_pages = ["\n".join(lines) for lines in pages]
    return "\n\n".join(text_pages), text_pages


def signature_dates(reader, pages):
    found = []
    try:
        fields = reader.get_fields() or {}
    except Exception:
        fields = {}

    def walk(x):
        if isinstance(x, dict):
            marker = x.get("/M") or x.get("M")
            if marker:
                m = re.search(r"D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?", str(marker))
                if m:
                    try:
                        p = [int(y or 0) for y in m.groups()]
                        z = datetime(*p)
                        found.append((z, z.strftime("%d/%m/%Y")))
                    except ValueError:
                        pass
            for y in x.values():
                if isinstance(y, (dict, list, tuple)):
                    walk(y)
        elif isinstance(x, (list, tuple)):
            for y in x:
                walk(y)

    walk(fields)
    marker = re.compile(
        r"assinado\s+digitalmente|assinatura\s+digital|documento\s+assinado|"
        r"assinad[oa]\s+eletronicamente|assinatura\s+eletr[oô]nica|"
        r"certificado\s+digital|ICP[-\s]?Brasil",
        re.I,
    )
    lines = "\n".join(pages).splitlines()
    for i, line in enumerate(lines):
        if not marker.search(line):
            continue
        block = line
        for j in range(i + 1, min(i + 4, len(lines))):
            if lines[j].strip():
                block += " " + lines[j]
            for m in DATE_RE.finditer(lines[j]):
                after = lines[j][m.end():m.end() + 25]
                tm = re.search(r"(\d{1,2}:\d{2}(?::\d{2})?)", after)
                try:
                    z = dt_from(m.group(), tm.group(1) if tm else None)
                    found.append((z, m.group().replace("-", "/").replace(".", "/")))
                except ValueError:
                    pass
        for m in DATE_RE.finditer(block):
            after = block[m.end():m.end() + 25]
            tm = re.search(r"(\d{1,2}:\d{2}(?::\d{2})?)", after)
            try:
                z = dt_from(m.group(), tm.group(1) if tm else None)
                found.append((z, m.group().replace("-", "/").replace(".", "/")))
            except ValueError:
                pass
    if not found:
        return None, None
    z, s = max(found, key=lambda x: x[0])
    return s, z.strftime("%Y-%m-%dT%H:%M:%S")


def process(text):
    for p in [
        r"(?:n[ºo°]?|n[uú]mero)?\s*(?:do\s+)?processo(?:\s+administrativo)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"processo\s*(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ]:
        m = re.search(p, text, re.I)
        if m:
            return number(m.group(1))
    return None


def modality(text):
    found = []
    for label, pat in MODALITIES:
        m = re.search(pat, text, re.I)
        if m:
            n = NUMBER_RE.search(text[m.end():m.end() + 180])
            found.append((m.start(), label, number(n.group()) if n else None))
    if not found:
        return None, None
    _, label, num = min(found, key=lambda item: item[0])
    return label, num


def modality_number(text, detected):
    if detected:
        pat = dict(MODALITIES)[detected]
        m = re.search(pat + r".{0,180}?((?:n[ºo°]?|n[uú]mero)?\s*\d{1,4}\s*/\s*\d{4})", text, re.I | re.S)
        if m:
            return number(m.group(1))
    for p in [
        r"(?:n[ºo°]?|n[uú]mero)\s*(?:da\s+)?modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ]:
        m = re.search(p, text, re.I)
        if m:
            return number(m.group(1))
    return None


def instrument(text):
    m = INSTRUMENT_RE.search(text)
    return m.group(1).capitalize() if m else None


def obj(text):
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^\s*OBJETO\s*[:\-]?\s*(.*)$", line, re.I)
        if not m:
            continue
        parts = []
        first = spaces(m.group(1))
        if first:
            parts.append(first)
        for next_line in lines[i + 1:]:
            if not next_line.strip():
                break
            parts.append(spaces(next_line))
        return spaces(" ".join(parts)) or None
    return None


def contractor(text):
    m = re.search(r"^\s*CONTRATADA\s*[:\-]?\s*([^\r\n]+)", text, re.I | re.M)
    return spaces(m.group(1)) if m else None


def cnpj_after_contractor(text):
    m = re.search(r"^\s*CONTRATADA\s*[:\-]?\s*([^\r\n]+)", text, re.I | re.M)
    if not m:
        return None
    candidate = CNPJ_RE.search(text[m.start(1):])
    return candidate.group(1) if candidate else None


def _money_after_label(text):
    m = CURRENCY_RE.search(text)
    if m:
        return f"R$ {m.group(1)}"
    m = PLAIN_VALUE_RE.search(text)
    return f"R$ {m.group(0)}" if m else None


def value(text):
    lines = text.splitlines()
    label_re = re.compile(r"total\s+do\s+proponente|valor\s+total|valor\s*\(\s*r\$\s*\)", re.I)
    for idx in range(len(lines) - 1, -1, -1):
        matches = list(label_re.finditer(lines[idx]))
        if not matches:
            continue
        for match in reversed(matches):
            candidate = _money_after_label(lines[idx][match.end():])
            if candidate:
                return candidate
            for next_idx in range(idx + 1, min(idx + 4, len(lines))):
                if not lines[next_idx].strip():
                    break
                candidate = _money_after_label(lines[next_idx])
                if candidate:
                    return candidate
    return None


def months(text):
    for m in reversed(list(re.finditer(r"vig[eê]ncia", text, re.I))):
        v = MONTHS_RE.search(text[m.start():m.end() + 220])
        if v:
            return int(v.group(1))
    return None


def extract(data, filename):
    reader = PdfReader(io.BytesIO(data))
    text, pages = body_text(reader)
    if not spaces(text):
        raise ValueError("Não foi possível extrair texto do PDF. O arquivo pode ser escaneado como imagem.")

    sd, sdt = signature_dates(reader, pages)
    mod, mnum = modality(text)
    inst = instrument(text)
    contractor_name = contractor(text)
    cs = CNPJ_RE.findall(text)
    selected_cnpj = cs[1] if len(cs) > 1 else cnpj_after_contractor(text)
    if not selected_cnpj and cs:
        selected_cnpj = cs[0]

    result = {
        "filename": filename,
        "process_number": process(text),
        "modality_number": modality_number(text, mod) or mnum,
        "detected_modality": mod,
        "modality": mod,
        "detected_instrument": inst,
        "instrument": inst,
        "object": obj(text),
        "contractor": contractor_name,
        "cnpj": cnpj(selected_cnpj) if selected_cnpj else None,
        "value": value(text),
        "signature_date": sd,
        "signature_datetime": sdt,
        "vigencia_meses": months(text),
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


def parse_date(v):
    m = DATE_RE.fullmatch(v.strip())
    if not m:
        raise ValueError("Data inválida. Use DD/MM/AAAA.")
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError as e:
        raise ValueError("Data inválida. Use DD/MM/AAAA.") from e


def add_months(base, n):
    total = base.year * 12 + base.month - 1 + n
    y = total // 12
    mo = total % 12 + 1
    nxt = date(y + 1, 1, 1) if mo == 12 else date(y, mo + 1, 1)
    last = (nxt - date.resolution).day
    return date(y, mo, min(base.day, last))


def replace_element(el, repls):
    for p in el.iter(qn("w:p")):
        nodes = [x for x in p.iter(qn("w:t")) if x.text]
        full = "".join(x.text or "" for x in nodes)
        for token, repl in repls.items():
            if token not in full:
                continue
            first = full.index(token)
            end = first + len(token)
            pos = 0
            a = b = None
            for i, n in enumerate(nodes):
                t = n.text or ""
                e = pos + len(t)
                if a is None and pos <= first < e:
                    a = i
                    ao = first - pos
                if pos < end <= e:
                    b = i
                    bo = end - pos
                    break
                pos = e
            if a is not None and b is not None:
                if a == b:
                    nodes[a].text = (nodes[a].text or "")[:ao] + repl + (nodes[a].text or "")[bo:]
                else:
                    nodes[a].text = (nodes[a].text or "")[:ao] + repl
                    for i in range(a + 1, b):
                        nodes[i].text = ""
                    nodes[b].text = (nodes[b].text or "")[bo:]
                full = "".join(x.text or "" for x in nodes)


def break_next(sect):
    p = OxmlElement("w:p")
    ppr = OxmlElement("w:pPr")
    sp = deepcopy(sect) if sect is not None else OxmlElement("w:sectPr")
    typ = sp.find(qn("w:type"))
    if typ is None:
        typ = OxmlElement("w:type")
        sp.insert(0, typ)
    typ.set(qn("w:val"), "nextPage")
    ppr.append(sp)
    p.append(ppr)
    return p


def generate(meta):
    initial = parse_date(meta["vigencia_inicial"])
    parse_date(meta["data_extrato"])
    docs = meta["documents"]
    path = Path(__file__).parent / "modelo" / "EXTRATO.docx"
    if not path.exists():
        raise ValueError("Modelo EXTRATO.docx não encontrado.")

    d = Document(str(path))
    body = d.element.body
    templates = [deepcopy(x) for x in body if x.tag != qn("w:sectPr")]
    sect = deepcopy(body.sectPr)

    instruments = []
    for i, item in enumerate(docs):
        if not item.get("signature_date"):
            raise ValueError(f"Assinatura digital não localizada para {item.get('filename', 'fornecedor')}.")
        if not item.get("process_number"):
            raise ValueError(f"Nº do processo não localizado para {item.get('filename', 'fornecedor')}.")
        if not item.get("modality_number"):
            raise ValueError(f"Nº da modalidade não localizado para {item.get('filename', 'fornecedor')}.")
        modality_value = item.get("modality") or item.get("detected_modality")
        instrument_value = item.get("instrument") or item.get("detected_instrument")
        if not modality_value:
            raise ValueError(f"Modalidade não localizada para {item.get('filename', 'fornecedor')}.")
        if not instrument_value:
            raise ValueError(f"Instrumento não localizado para {item.get('filename', 'fornecedor')}.")
        instruments.append(instrument_value)
        n = int(item.get("vigencia_meses") or 0)
        if n <= 0:
            raise ValueError(f"Vigência inválida para {item.get('filename', 'fornecedor')}.")

        final = add_months(initial, n)
        repl = {
            "{{DATA.ASS}}": item.get("signature_date", ""),
            "{{MODALIDADE}}": modality_value,
            "{{INSTRUMENTO}}": instrument_value,
            "{{N.PROCESSO}}": item["process_number"],
            "{{N.MODALIDADE}}": item["modality_number"],
            "{{OBJETO}}": item.get("object", ""),
            "{{SETOR}}": meta["sector"],
            "{{CONTRATADA}}": item.get("contractor", ""),
            "{{CNPJ}}": item.get("cnpj", ""),
            "{{VALOR}}": item.get("value", ""),
            "{{VIG.INICIAL}}": initial.strftime("%d/%m/%Y"),
            "{{VIG.FINAL}}": final.strftime("%d/%m/%Y"),
            "{{DATA.EXTRATO}}": meta["data_extrato"],
        }
        if i == 0:
            replace_element(body, repl)
        else:
            if sect is not None:
                sect.addprevious(break_next(sect))
            for t in templates:
                x = deepcopy(t)
                replace_element(x, repl)
                sect.addprevious(x) if sect is not None else body.append(x)

    out = io.BytesIO()
    d.save(out)
    out.seek(0)
    return out.getvalue(), instruments


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    async def one(f):
        data = await f.read()
        try:
            return await run_in_threadpool(extract, data, f.filename or "documento.pdf")
        except Exception as e:
            return {
                "filename": f.filename or "documento.pdf",
                "process_number": None,
                "modality_number": None,
                "detected_modality": None,
                "modality": None,
                "detected_instrument": None,
                "instrument": None,
                "object": None,
                "contractor": None,
                "cnpj": None,
                "value": None,
                "signature_date": None,
                "signature_datetime": None,
                "vigencia_meses": None,
                "error": str(e),
            }

    return await asyncio.gather(*(one(f) for f in files))


@app.post("/api/generate")
async def generate_api(metadata_json: str = Form(...)):
    try:
        meta = json.loads(metadata_json)
        data, instruments = await run_in_threadpool(generate, meta)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    unique = set(instruments)
    if unique == {"Ata"}:
        name = "Extratos-Ata.docx"
    elif unique == {"Contrato"}:
        name = "Extratos-Contrato.docx"
    else:
        name = "Extratos-Ata-e-Contrato.docx"

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
