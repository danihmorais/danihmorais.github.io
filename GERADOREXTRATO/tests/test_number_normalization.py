import unittest

from extractor import normalize_text, number


class NumberNormalizationTests(unittest.TestCase):
    def test_collapses_split_year(self):
        self.assertIn("01/2026", normalize_text("ATA nº 01/202 6"))
        self.assertEqual(number("ATA nº 01/202 6"), "01/2026")

    def test_does_not_merge_unrelated_digits_after_year(self):
        self.assertEqual(number("ATA nº 01/2026 12 meses"), "01/2026")
        self.assertIn("14.133/2021 6", normalize_text("Lei 14.133/2021 6"))


if __name__ == "__main__":
    unittest.main()
