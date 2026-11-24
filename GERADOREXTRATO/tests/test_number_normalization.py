import re
import unittest

YEAR_SPACE_RE = re.compile(r"(?<=/)(\d{2})\s+(\d)(?!\d)")


class NumberNormalizationTests(unittest.TestCase):
    def test_collapses_split_year(self):
        self.assertEqual(YEAR_SPACE_RE.sub(r"\1\2", "ATA nº 01/202 6"), "ATA nº 01/2026")


if __name__ == "__main__":
    unittest.main()
