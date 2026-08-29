import unittest

from extractor import instrument_info, modality, modality_number, normalize_text, process


class ExtractorTests(unittest.TestCase):
    def test_instrument_after_process_and_modality(self):
        text = """Processo nº 76/2025 – Pregão Presencial nº 46/2025
ATA DE REGISTRO DE PREÇOS
ATA nº 01/2026
"""
        self.assertEqual(instrument_info(text), ("Ata", "01/2026"))
        self.assertEqual(process(text), "76/2025")
        self.assertEqual(modality(text), ("Pregão Presencial", "46/2025"))

    def test_instrument_same_line(self):
        self.assertEqual(instrument_info("CONTRATO ADMINISTRATIVO nº 12/2026"), ("Contrato", "12/2026"))

    def test_contract_not_process(self):
        text = """Processo 76/2025
CONTRATO ADMINISTRATIVO
Número: 08/2026
"""
        self.assertEqual(instrument_info(text), ("Contrato", "08/2026"))

    def test_split_pdf_number(self):
        self.assertEqual(normalize_text("ATA nº 01 /202 6"), "ATA nº 01/2026")

    def test_does_not_guess_instrument_number(self):
        self.assertEqual(instrument_info("Processo nº 76/2025\nATA DE REGISTRO DE PREÇOS"), ("Ata", None))


if __name__ == "__main__":
    unittest.main()
