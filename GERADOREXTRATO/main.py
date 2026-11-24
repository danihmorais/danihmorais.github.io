"""Ponto de entrada da API do GERADOR.

A camada HTTP continua em ``main_original``. A extração fica isolada em
``extractor.py`` para ser testada e evoluída independentemente dos endpoints.
"""
import main_original
from extractor import (
    cnpj as _cnpj,
    cnpj_after_contractor as _cnpj_after_contractor,
    cnpj_candidates as _cnpj_candidates,
    contractor as _contractor,
    instrument_info as _instrument_info,
    modality as _modality,
    modality_number as _modality_number,
    months as _months,
    number as _number,
    obj as _obj,
    process as _process,
    value as _value,
)

main_original.number = _number
main_original.cnpj = _cnpj
main_original._cnpj_candidates = _cnpj_candidates
main_original.process = _process
main_original.modality = _modality
main_original.modality_number = _modality_number
main_original.instrument_info = _instrument_info
main_original.obj = _obj
main_original.contractor = _contractor
main_original.cnpj_after_contractor = _cnpj_after_contractor
main_original.value = _value
main_original.months = _months

_original_generate = main_original.generate

class _FirstUpperModality(str):
    def __new__(cls, value):
        obj = super().__new__(cls, value)
        obj._first = True
        return obj

    def __str__(self):
        if self._first:
            self._first = False
            return super().__str__().upper()
        return super().__str__()


def _generate_with_first_modality_upper(meta):
    for item in meta.get("documents") or []:
        if item.get("modality"):
            item["modality"] = _FirstUpperModality(item["modality"])
    return _original_generate(meta)


main_original.generate = _generate_with_first_modality_upper

app = main_original.app