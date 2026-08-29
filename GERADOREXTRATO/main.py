"""API do Gerador de Extrato com extração robusta de número de instrumento."""
from __future__ import annotations

import re

import main_original

INSTRUMENT_RE = re.compile(r"(?<![\wÀ-ÿ])(ATA|CONTRATO)(?![\wÀ-ÿ])", re.I)
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
LABELED_NUMBER_RE = re.compile(r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4})\s*/\s*(\d{4})", re.I)

def _normalize_extracted_text(text: str) -> str:
    value = text or ""
    value = re.sub(r"(?<=\d)\s*/\s*(?=\d)", "/", value)
    value = re.sub(r"[ \t]+", " ", value)
    return value

def _format_number(prefix: str, year: str) -> str:
    value = str(int(prefix))
    return f"{int(value):02d}/{year}" if len(value) <= 2 else f"{value}/{year}"

def instrument_info(text: str):
    """Identifica ATA/CONTRATO e prioriza o número do próprio instrumento."""
    lines = _normalize_extracted_text(text).splitlines()
    for index, line in enumerate(lines):
        match = INSTRUMENT_RE.search(line)
        if not match:
            continue
        instrument = match.group(1).capitalize()
        window_lines = [line]
        for offset in range(1, 6):
            if index + offset < len(lines):
                candidate = lines[index + offset].strip()
                if candidate:
                    window_lines.append(candidate)
        for candidate in window_lines:
            labeled = LABELED_NUMBER_RE.search(candidate)
            if labeled:
                return instrument, _format_number(labeled.group(1), labeled.group(2))
        for candidate in window_lines:
            plain = NUMBER_RE.search(candidate)
            if plain:
                return instrument, _format_number(plain.group(1), plain.group(2))
        return instrument, None
    return None, None

main_original.instrument_info = instrument_info
app = main_original.app
