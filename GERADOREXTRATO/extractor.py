"""Extração contextual e resiliente de dados de ATAs e Contratos."""
from __future__ import annotations
import re
import unicodedata

NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
LABELED_NUMBER_RE = re.compile(r"(?:n[ºo°]?|n[úu]mero|n[úu]m\.?)\s*[:\-.]?\s*(\d{1,4}\s*/\s*\d{4})(?!\d)", re.I)
INSTRUMENT_RE = re.compile(r"\b(ATA|CONTRATO)\b", re.I)
DATE_RE = re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{4})[./-](\d{2})[./-](\d{2})(?!\d)")
CNPJ_RE = re.compile(r"(?<!\d)(?:\d{2}\s*[./-]?\s*\d{3}\s*[./-]?\s*\d{3}\s*/\s*\d{4}\s*[./-]?\s*\d{2}|\d{14})(?!\d)")
CURRENCY_RE = re.compile(r"(?<![\d.,])R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))(?![\d.,])", re.I)
PLAIN_VALUE_RE = re.compile(r"(?<![\d.,])(?:[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})|[0-9]+,[0-9]{2})(?![\d.,])")
MODALITIES = (("Pregão Eletrônico", r"preg[aã]o\s+eletr[oô]nico"),("Pregão Presencial", r"preg[aã]o\s+presencial"),("Concorrência Eletrônica", r"concorr[eê]ncia\s+eletr[oô]nica"),("Concorrência Presencial", r"concorr[eê]ncia\s+presencial"),("Concurso", r"concurso"),("Leilão", r"leil[aã]o"),("Dispensa", r"dispensa"),("Inexigibilidade", r"inexigibilidade"))
MONTH_RE = re.compile(r"(?<!\d)(\d{1,3})\s*(?:\([^)]*\)\s*)?m[eê]s(?:es)?(?![a-z])", re.I)
YEAR_RE = re.compile(r"(?<!\d)(\d{1,2})\s*(?:\([^)]*\)\s*)?ano(?:s)?(?![a-z])", re.I)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").replace("\xa0", " ").replace("\u200b", "")
    value = re.sub(r"[ \t]+", " ", value)
    # Corrige apenas fragmentações inequívocas de números produzidas por PDFs.
    value = re.sub(r"(?<=\d)\s*/\s*(?=\d)", "/", value)
    value = re.sub(r"(\d{1,4})/(\d{2})\s+(\d)(?!\d)", r"\1/\2\3", value)
    return "\n".join(line.rstrip() for line in value.splitlines()).strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", normalize_text(value))


def format_number(prefix: str, year: str) -> str:
    n = str(int(prefix))
    return f"{int(n):02d}/{year}" if len(n) <= 2 else f"{n}/{year}"


def number(value: str | None) -> str | None:
    match = NUMBER_RE.search(normalize_text(value or ""))
    if not match or not 1900 <= int(match.group(2)) <= 2200:
        return None
    return format_number(match.group(1), match.group(2))


def _labeled(value: str) -> str | None:
    match = LABELED_NUMBER_RE.search(value)
    return number(match.group(1)) if match else None


def instrument_info(text: str):
    """Identifica ATA/CONTRATO e o número por proximidade sem confundir processo/modalidade."""
    ls = [x.strip() for x in normalize_text(text).splitlines()]
    candidates = []
    for i, line in enumerate(ls):
        hit = INSTRUMENT_RE.search(line)
        if not hit:
            continue
        instrument = hit.group(1).capitalize()
        # Somente texto posterior ao título na mesma linha.
        same = line[hit.end():]
        if (n := _labeled(same)):
            candidates.append((110, instrument, n))
        elif (m := NUMBER_RE.search(same)) and number(m.group()):
            candidates.append((90, instrument, number(m.group())))
        # Linhas posteriores recebem pontuação decrescente; números rotulados
        # continuam mais fortes que números soltos.
        for d in range(1, 7):
            if i + d >= len(ls):
                break
            candidate = ls[i + d]
            if (n := _labeled(candidate)):
                candidates.append((105 - d * 2, instrument, n))
            elif (m := NUMBER_RE.search(candidate)) and number(m.group()):
                candidates.append((70 - d * 7, instrument, number(m.group())))
    if not candidates:
        return None, None
    _, instrument, n = max(candidates, key=lambda x: x[0])
    return instrument, n


def process(text: str) -> str | None:
    t = compact(text)
    patterns = (r"processo\s+(?:administrativo\s+|eletr[oô]nico\s+|SEI\s+)?(?:n[ºo°]?|n[úu]mero|n[úu]m\.?)?\s*[:\-.]?\s*(\d{1,4}\s*/\s*\d{4})", r"(?:n[ºo°]?|n[úu]mero|n[úu]m\.?)\s*[:\-.]?\s*(\d{1,4}\s*/\s*\d{4})\s+(?:do\s+)?processo")
    for p in patterns:
        m = re.search(p, t, re.I)
        if m and number(m.group(1)): return number(m.group(1))
    return None


def modality(text: str):
    t = compact(text); found = []
    for label, pattern in MODALITIES:
        m = re.search(pattern, t, re.I)
        if not m: continue
        after = t[m.end():m.end()+260]
        n = _labeled(after)
        if not n:
            q = NUMBER_RE.search(after)
            n = number(q.group()) if q else None
        found.append((m.start(), label, n))
    if not found: return None, None
    _, label, n = min(found, key=lambda x: x[0]); return label, n


def modality_number(text: str, detected: str | None):
    if not detected: return None
    pattern = dict(MODALITIES).get(detected)
    if not pattern: return None
    t = compact(text); m = re.search(pattern, t, re.I)
    if not m: return None
    after = t[m.end():m.end()+300]
    n = _labeled(after)
    if n: return n
    q = NUMBER_RE.search(after)
    return number(q.group()) if q else None


def _valid_cnpj(value: str) -> bool:
    d = re.sub(r"\D", "", value or "")
    if len(d) != 14 or len(set(d)) == 1: return False
    w = [5,4,3,2,9,8,7,6,5,4,3,2]; r = sum(int(a)*b for a,b in zip(d[:12],w)) % 11; c1 = 0 if r < 2 else 11-r
    w = [6,5,4,3,2,9,8,7,6,5,4,3,2]; r = sum(int(a)*b for a,b in zip(d[:13],w)) % 11; c2 = 0 if r < 2 else 11-r
    return d[12:] == f"{c1}{c2}"


def cnpj_candidates(text: str):
    return [m.group() for m in CNPJ_RE.finditer(normalize_text(text)) if _valid_cnpj(m.group())]


def cnpj(value: str | None) -> str:
    d = re.sub(r"\D", "", value or "")
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else (value or "").strip()


def cnpj_after_contractor(text: str):
    m = re.search(r"(?:CONTRATADA|CONTRATADO|DETENTORA|FORNECEDOR|FORNECEDORA|EMPRESA)\b[^\n]{0,700}", normalize_text(text), re.I)
    if not m: return None
    c = cnpj_candidates(m.group())
    return c[0] if c else None


def obj(text: str):
    ls = [x.strip() for x in normalize_text(text).splitlines()]
    start = re.compile(r"^\s*(?:OBJETO|DO OBJETO|OBJETO DA CONTRATA[CÇ][AÃ]O)\s*[:\-]?\s*(.*)$", re.I)
    stop = re.compile(r"^\s*(?:PROCESSO|CONTRATANTE|CONTRATADA|CONTRATADO|FORNECEDOR|DETENTORA|VALOR|VIG[EÊ]NCIA|PRAZO|ASSINATURA)\b", re.I)
    for i, line in enumerate(ls):
        m = start.match(line)
        if not m: continue
        out = [m.group(1).strip()] if m.group(1).strip() else []
        for x in ls[i+1:i+13]:
            if not x or stop.match(x): break
            out.append(x)
        if out: return re.sub(r"\s+", " ", " ".join(out)).strip(" :;.-")
    return None


def contractor(text: str):
    ls = [x.strip() for x in normalize_text(text).splitlines()]
    label = re.compile(r"^\s*(CONTRATADA|CONTRATADO|DETENTORA|FORNECEDOR|FORNECEDORA|EMPRESA)\s*[:\-]?\s*(.*)$", re.I)
    for i, line in enumerate(ls):
        m = label.match(line)
        if not m: continue
        if m.group(2).strip() and not CNPJ_RE.fullmatch(m.group(2).strip()): return m.group(2).strip()
        for x in ls[i+1:i+4]:
            if x: return x.strip()
    return None


def value(text: str):
    t = compact(text)
    labels = re.compile(r"valor\s+(?:total|global|contratado|da\s+contrata[cç][aã]o|registrado)|pre[cç]o\s+total|total\s+(?:do|da)\s+(?:proponente|fornecedor|ata)", re.I)
    for m in labels.finditer(t):
        local = t[m.end():m.end()+180]
        q = CURRENCY_RE.search(local) or PLAIN_VALUE_RE.search(local)
        if q: return f"R$ {q.group(1) if q.re is CURRENCY_RE else q.group()}"
    return None


def months(text: str):
    t = compact(text)
    anchors = list(re.finditer(r"vig[eê]ncia|prazo\s+(?:de\s+)?vig[eê]ncia", t, re.I))
    for a in reversed(anchors):
        w = t[a.end():a.end()+600]
        m = MONTH_RE.search(w)
        if m and 1 <= int(m.group(1)) <= 120: return int(m.group(1))
        y = YEAR_RE.search(w)
        if y and 1 <= int(y.group(1))*12 <= 120: return int(y.group(1))*12
    return None
