"""API do Gerador de Extrato com extração contextual do número do instrumento."""
from __future__ import annotations

import re

import main_original

INSTRUMENT_RE = re.compile(r"(?<![\wÀ-ÿ])(ATA|CONTRATO)(?![\wÀ-ÿ])", re.I)
NUMBER_RE = re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
LABELED_NUMBER_RE = re.compile(
    r"(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4})\s*/\s*(\d{4})",
    re.I,
)


def _normalize_extracted_text(text: str) -> str:
    value = text or ""
    # O pypdf pode separar os algarismos e a barra: "01 /2026" ou "01/202 6".
    value = re.sub(r"(?<=\d)\s*/\s*(?=\d)", "/", value)
    value = re.sub(r"(?<=/)(\d{2})\s+(\d)(?!\d)", r"\1\3", value)
    value = re.sub(r"[ \t]+", " ", value)
    return value


def _format_number(prefix: str, year: str) -> str:
    value = str(int(prefix))
    return f"{int(value):02d}/{year}" if len(value) <= 2 else f"{value}/{year}"


def instrument_info(text: str):
    """Identifica ATA/CONTRATO sem capturar números que aparecem antes do título.

    O número só é aceito quando estiver depois da ocorrência de ATA/CONTRATO,
    preferencialmente rotulado por 'nº'/'número'. Isso impede que o número do
    processo ou da modalidade, localizado no cabeçalho anterior, seja usado
    como número do instrumento.
    """
    lines = _normalize_extracted_text(text).splitlines()

    for index, line in enumerate(lines):
        match = INSTRUMENT_RE.search(line)
        if not match:
            continue

        instrument = match.group(1).capitalize()
        # Na própria linha, só examinamos o trecho posterior ao título.
        # Assim, "Processo 76/2025 ... ATA ..." não pode devolver 76/2025.
        after_instrument = line[match.end():]
        window_lines = [after_instrument]

        for offset in range(1, 6):
            if index + offset < len(lines):
                candidate = lines[index + offset].strip()
                if candidate:
                    window_lines.append(candidate)

        # Primeiro: número explicitamente associado ao instrumento.
        for candidate in window_lines:
            labeled = LABELED_NUMBER_RE.search(candidate)
            if labeled:
                return instrument, _format_number(labeled.group(1), labeled.group(2))

        # Segundo: número imediatamente após o título, sem aceitar números
        # que estejam antes da palavra ATA/CONTRATO.
        for candidate in window_lines:
            plain = NUMBER_RE.search(candidate)
            if plain:
                return instrument, _format_number(plain.group(1), plain.group(2))

        return instrument, None


main_original.instrument_info = instrument_info
app = main_original.app
