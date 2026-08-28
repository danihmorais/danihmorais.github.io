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

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

DATE_RE = re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
CURRENCY_RE = re.compile(r"(?<![\d.,])R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))(?![\d.,])", re.I)
PLAIN_VALUE_RE = re.compile(r"(?<![\d.,])(?:[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+,[0-9]{2})(?![\d.,])")
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
CNPJ_RE = re.compile(r"(?<!\d)(?:\d{2}\s*[./-]?\s*\d{3}\s*[./-]?\s*\d{3}\s*/\s*\d{4}\s*[./-]?\s*\d{2}|\d{14})(?!\d)")
MONTHS_RE = re.compile(r"(?<!\d)(\d{1,3})\s*(?:\(\s*[^)]*\)\s*)?(?:mes(?:es)?|m[eê]s(?:es)?)(?![a-z])", re.I)
YEARS_RE = re.compile(r"(?<!\d)(\d{1,2})\s*(?:\(\s*[^)]*\)\s*)?(?:ano(?:s)?)(?![a-z])", re.I)
INSTRUMENT_RE = re.compile(r"(?<!\w)(ATA|CONTRATO)(?!\w)", re.I)
INSTRUMENT_NUMBER_RE = re.compile(r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})", re.I)
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


def _valid_cnpj(v):
    d = re.sub(r"\D", "", v or "")
    if len(d) != 14 or len(set(d)) == 1:
        return False
    w = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    r = sum(int(a) * b for a, b in zip(d[:12], w)) % 11
    c1 = 0 if r < 2 else 11 - r
    w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    r = sum(int(a) * b for a, b in zip(d[:13], w)) % 11
    c2 = 0 if r < 2 else 11 - r
    return d[12] == str(c1) and d[13] == str(c2)


def _cnpj_candidates(text):
    return [m.group() for m in CNPJ_RE.finditer(text or "") if _valid_cnpj(m.group())]


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
    pg = [g for g in gaps if g > LINE_Y_TOLERANCE_PT]
    normal_gap = sorted(pg)[len(pg) // 2] if pg else 12.0
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
    return "\n\n".join("\n".join(x) for x in pages), ["\n".join(x) for x in pages]


def raw_text(reader):
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    return "\n\n".join(pages), pages


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
    marker = re.compile(r"assinado\s+digitalmente|assinatura\s+digital|documento\s+assinado|assinad[oa]\s+eletronicamente|assinatura\s+eletr[oô]nica|certificado\s+digital|ICP[-\s]?Brasil", re.I)
    lines = "\n".join(pages).splitlines()
    for i, line in enumerate(lines):
        if not marker.search(line):
            continue
        block = line
        for j in range(i + 1, min(i + 5, len(lines))):
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
        m = re.search(p, text or "", re.I)
        if m:
            return number(m.group(1))
    return None


def modality(text):
    found = []
    for label, pat in MODALITIES:
        m = re.search(pat, text or "", re.I)
        if m:
            n = NUMBER_RE.search((text or "")[m.end():m.end() + 220])
            found.append((m.start(), label, number(n.group()) if n else None))
    if not found:
        return None, None
    _, label, num = min(found, key=lambda x: x[0])
    return label, num


def modality_number(text, detected):
    if detected:
        pat = dict(MODALITIES)[detected]
        m = re.search(pat + r".{0,220}?((?:n[ºo°]?|n[uú]mero)?\s*\d{1,4}\s*/\s*\d{4})", text or "", re.I | re.S)
        if m:
            return number(m.group(1))
    for p in [
        r"(?:n[ºo°]?|n[uú]mero)\s*(?:da\s+)?modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
        r"modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})",
    ]:
        m = re.search(p, text or "", re.I)
        if m:
            return number(m.group(1))
    return None


def instrument_info(text):
    """Localiza o primeiro ATA/CONTRATO no corpo do documento e seu número."""
    for match in INSTRUMENT_RE.finditer(text or ""):
        instrument_value = match.group(1).capitalize()
        window = (text or "")[match.end():match.end() + 320]
        number_match = INSTRUMENT_NUMBER_RE.search(window)
        if number_match:
            return instrument_value, number(number_match.group(1))
        number_match = NUMBER_RE.search(window)
        if number_match:
            return instrument_value, number(number_match.group())
        return instrument_value, None
    return None, None


def obj(text):
    lines = (text or "").splitlines()
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
    m = re.search(r"^\s*CONTRATADA\s*[:\-]?\s*([^\r\n]+)", text or "", re.I | re.M)
    if m:
        return spaces(m.group(1))
    m = re.search(r"^\s*CONTRATADO\s*[:\-]?\s*([^\r\n]+)", text or "", re.I | re.M)
    return spaces(m.group(1)) if m else None


def cnpj_after_contractor(text):
    m = re.search(r"^\s*(?:CONTRATADA|CONTRATADO)\s*[:\-]?\s*([^\r\n]+)", text or "", re.I | re.M)
    if not m:
        return None
    candidate = CNPJ_RE.search((text or "")[m.start(1):m.start(1) + 500])
    return candidate.group() if candidate and _valid_cnpj(candidate.group()) else None


def _money_after_label(text):
    m = CURRENCY_RE.search(text or "")
    if m:
        return f"R$ {m.group(1)}"
    m = PLAIN_VALUE_RE.search(text or "")
    return f"R$ {m.group(0)}" if m else None


def value(text):
    text = text or ""
    lines = text.splitlines()
    label_re = re.compile(r"(?:total\s+do\s+proponente|valor\s+total|valor\s*\(\s*r\s*\$\s*\))", re.I)
    for idx in range(len(lines) - 1, -1, -1):
        matches = list(label_re.finditer(lines[idx]))
        if not matches:
            continue
        for match in reversed(matches):
            candidate = _money_after_label(lines[idx][match.end():])
            if candidate:
                return candidate
            candidate = _money_after_label(" ".join(lines[idx + 1:idx + 8])[:240])
            if candidate:
                return candidate
    for m in reversed(list(label_re.finditer(text))):
        candidate = _money_after_label(text[m.end():m.end() + 240])
        if candidate:
            return candidate
    return None


def months(text):
    text = text or ""
    for m in reversed(list(re.finditer(r"vig[eê]ncia", text, re.I))):
        window = text[m.end():m.end() + 420]
        v = MONTHS_RE.search(window)
        if v:
            return int(v.group(1))
        y = YEARS_RE.search(window)
        if y:
            return int(y.group(1)) * 12
    return None


def extract(data, filename):
    reader = PdfReader(io.BytesIO(data))
    text, pages = body_text(reader)
    raw, raw_pages = raw_text(reader)
    searchable = text if spaces(text) else raw
    if not spaces(searchable):
        raise ValueError("Não foi possível extrair texto do PDF. O arquivo pode ser escaneado como imagem.")

    sd, sdt = signature_dates(reader, pages)
    if not sd and raw_pages != pages:
        sd, sdt = signature_dates(reader, raw_pages)

    mod, mnum = modality(text)
    if not mod and raw:
        mod, mnum = modality(raw)

    inst, inst_number = instrument_info(text)
    if not inst and raw:
        inst, inst_number = instrument_info(raw)

    contractor_name = contractor(text) or contractor(raw)
    body_cnpjs = _cnpj_candidates(text)
    raw_cnpjs = _cnpj_candidates(raw)
    cnpj_candidates = body_cnpjs if len(body_cnpjs) >= 2 else raw_cnpjs
    selected_cnpj = None
    if len(cnpj_candidates) >= 2:
        selected_cnpj = cnpj_candidates[1]
    elif len(cnpj_candidates) == 1:
        selected_cnpj = cnpj_candidates[0]
    if not selected_cnpj:
        selected_cnpj = cnpj_after_contractor(text) or cnpj_after_contractor(raw)

    result = {
        "filename": filename,
        "process_number": process(text) or process(raw),
        "modality_number": modality_number(text, mod) or modality_number(raw, mod) or mnum,
        "detected_modality": mod,
        "modality": mod,
        "detected_instrument": inst,
        "instrument": inst,
        "instrument_number": inst_number,
        "object": obj(text) or obj(raw),
        "contractor": contractor_name,
        "cnpj": cnpj(selected_cnpj) if selected_cnpj else None,
        "value": value(text) or value(raw),
        "signature_date": sd,
        "signature_datetime": sdt,
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


def parse_date(v):
    m = DATE_RE.fullmatch((v or "").strip())
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


def _formatted_replacement(run, value):
    value = str(value or "")
    rpr = run.find(qn("w:rPr"))
    if rpr is not None:
        caps = rpr.find(qn("w:caps"))
        small = rpr.find(qn("w:smallCaps"))
        if (
            (caps is not None and caps.get(qn("w:val"), "1") not in ("0", "false", "off"))
            or (small is not None and small.get(qn("w:val"), "1") not in ("0", "false", "off"))
        ):
            return value.upper()
    return value


def replace_element(el, repls):
    """Substitui placeholders entre runs sem destruir a formatação do modelo."""
    for p in el.iter(qn("w:p")):
        nodes = [x for x in p.iter(qn("w:t")) if x.text is not None]
        for token, repl in repls.items():
            while True:
                full = "".join(x.text or "" for x in nodes)
                first = full.find(token)
                if first < 0:
                    break
                end = first + len(token)
                pos = 0
                a = b = None
                ao = bo = 0
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
                if a is None or b is None:
                    break
                replacement = _formatted_replacement(nodes[a].getparent(), repl)
                if a == b:
                    t = nodes[a].text or ""
                    nodes[a].text = t[:ao] + replacement + t[bo:]
                else:
                    t = nodes[a].text or ""
                    nodes[a].text = t[:ao] + replacement
                    for i in range(a + 1, b):
                        nodes[i].text = ""
                    nodes[b].text = (nodes[b].text or "")[bo:]


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
    sect = body.sectPr
    templates = [deepcopy(x) for x in body if x.tag != qn("w:sectPr")]
    instruments = []

    for i, item in enumerate(docs):
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

        instrument_value = item["instrument"]
        modality_value = item["modality"]
        instruments.append(instrument_value)
        n = int(item.get("vigencia_meses") or 0)
        if n <= 0:
            raise ValueError(f"Vigência inválida para {item.get('filename', 'fornecedor')}.")
        final = add_months(initial, n)
        repl = {
            "{{DATA.ASS}}": item.get("signature_date", ""),
            "{{MODALIDADE}}": modality_value,
            "{{INSTRUMENTO}}": instrument_value,
            "{{N.INST}}": item.get("instrument_number", ""),
            "{{N.PROC}}": item["process_number"],
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
            insert_at = body.index(sect)
            body.insert(insert_at, break_next(sect))
            insert_at = body.index(sect)
            for t in templates:
                x = deepcopy(t)
                replace_element(x, repl)
                body.insert(insert_at, x)
                insert_at += 1

    out = io.BytesIO()
    d.save(out)
    out.seek(0)
    return out.getvalue(), instruments


def convert_docx_to_pdf(docx_data):
    """Converte DOCX em PDF usando o engine de layout do Aspose.Words, sem LibreOffice/Office."""
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

    with tempfile.TemporaryDirectory(prefix="geradorextrato-") as tmp:
        work = Path(tmp)
        source = work / "extrato.docx"
        output = work / "extrato.pdf"
        source.write_bytes(docx_data)

        try:
            doc = aw.Document(str(source))
            font_dir = os.getenv("ASPOSE_FONT_DIR", "").strip()
            if font_dir and Path(font_dir).exists():
                doc.font_settings.set_fonts_folder(font_dir, True)
            doc.save(str(output))
        except Exception as exc:
            raise ValueError(f"Falha ao converter o extrato para PDF com Aspose.Words: {exc}") from exc

        if not output.exists() or output.stat().st_size == 0:
            raise ValueError("O Aspose.Words não produziu um PDF válido.")
        return output.read_bytes()


def export_name(instruments, extension):
    unique = set(instruments)
    base = "Extratos-Ata" if unique == {"Ata"} else "Extratos-Contrato" if unique == {"Contrato"} else "Extratos-Ata-e-Contrato"
    return f"{base}.{extension}"


@app.get("/api/health")
async def health():
    return {"status": "ok", "pdf_converter": "aspose-words"}


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
                "instrument_number": None,
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


@app.post("/api/generate-docx")
async def generate_docx_api(metadata_json: str = Form(...)):
    try:
        meta = json.loads(metadata_json)
        docx_data, instruments = await run_in_threadpool(generate, meta)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return StreamingResponse(
        io.BytesIO(docx_data),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{export_name(instruments, "docx")}"'},
    )


@app.post("/api/generate")
async def generate_api(metadata_json: str = Form(...)):
    try:
        meta = json.loads(metadata_json)
        docx_data, instruments = await run_in_threadpool(generate, meta)
        pdf_data = await run_in_threadpool(convert_docx_to_pdf, docx_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return StreamingResponse(
        io.BytesIO(pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{export_name(instruments, "pdf")}"'},
    )
