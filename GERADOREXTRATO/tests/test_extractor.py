import unittest

from extractor import instrument_info, modality, modality_number, normalize_text, process, number


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

    def test_legal_reference_is_not_number(self):
        self.assertIsNone(number("Lei 14.133/2021"))
        self.assertIsNone(number("art. 124 da Lei 14.133/2021"))

    def test_legal_reference_cannot_win_over_instrument(self):
        text = """ATA DE REGISTRO DE PREÇOS
ATA nº 04/2026
3. DA VIGÊNCIA DA ATA
observado o art. 84 da Lei 14.133/2021.
"""
        self.assertEqual(instrument_info(text), ("Ata", "04/2026"))


if __name__ == "__main__":
    unittest.main()
