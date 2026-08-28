"""Entry point da API, com correção isolada da identificação do número do instrumento."""
from __future__ import annotations

import re

import main_original

INSTRUMENT_RE = re.compile(r"(?<!\w)(ATA|CONTRATO)(?!\w)", re.I)
INSTRUMENT_NUMBER_RE = re.compile(
    r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})", re.I
)
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")


def instrument_info(text: str):
    """Extrai o número ligado ao título do instrumento, sem olhar linhas anteriores.

    Isso evita que "ATA DE REGISTRO DE PREÇOS" capture, por exemplo, o número
    do processo exibido imediatamente acima. No PDF de teste, o resultado é 01/2026.
    """
    lines = (text or "").splitlines()
    for index, line in enumerate(lines):
        match = INSTRUMENT_RE.search(line)
        if not match:
            continue

        instrument = match.group(1).capitalize()
        candidates = [line[match.start() : match.start() + 260]]
        for offset in range(1, 5):
            if index + offset < len(lines):
                candidate = lines[index + offset].strip()
                if candidate:
                    candidates.append(candidate[:260])

        for candidate in candidates:
            labeled = INSTRUMENT_NUMBER_RE.search(candidate)
            if labeled:
                return instrument, main_original.number(labeled.group(1))

        for candidate in candidates:
            plain = NUMBER_RE.search(candidate)
            if plain:
                return instrument, main_original.number(plain.group())

    return None, None


main_original.instrument_info = instrument_info
app = main_original.app
