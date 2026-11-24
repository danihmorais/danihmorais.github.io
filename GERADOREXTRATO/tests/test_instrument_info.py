import unittest

from GERADOREXTRATO.main import instrument_info


class InstrumentInfoTests(unittest.TestCase):
    def test_prefers_instrument_number_over_process_before_title(self):
        text = """Processo nº 76 /2025 – Pregão Presencial nº 46 /2025
ATA DE REGISTRO DE PREÇOS

ATA nº 01 /202 6

PROCESSO Nº 76 /2025
PREGÃO PRESENCIAL Nº 46 /2025
"""
        self.assertEqual(instrument_info(text), ("Ata", "01/2026"))

    def test_does_not_take_number_from_before_instrument(self):
        text = """Processo nº 76/2025
PREGÃO PRESENCIAL Nº 46/2025
ATA DE REGISTRO DE PREÇOS
"""
        self.assertEqual(instrument_info(text), ("Ata", None))


if __name__ == "__main__":
    unittest.main()
