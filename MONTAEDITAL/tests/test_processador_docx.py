import unittest

from docx import Document
from docx.oxml import OxmlElement

from MONTAEDITAL.processador_docx import _substituir_texto_mantendo_formatacao


class SubstituicaoPlaceholderDocxTests(unittest.TestCase):
    def test_substitui_marcador_dividido_com_texto_em_hyperlink(self):
        documento = Document()
        paragrafo = documento.add_paragraph()
        paragrafo.add_run("Início {{DATA REC PRO")

        hyperlink = OxmlElement("w:hyperlink")
        run_link = OxmlElement("w:r")
        texto_link = OxmlElement("w:t")
        texto_link.text = "P1"
        run_link.append(texto_link)
        hyperlink.append(run_link)
        paragrafo._p.append(hyperlink)

        paragrafo.add_run("}} às 08h00.")

        self.assertEqual(
            paragrafo.text,
            "Início {{DATA REC PROP1}} às 08h00.",
        )

        substituiu = _substituir_texto_mantendo_formatacao(
            paragrafo,
            "{{DATA REC PROP1}}",
            "28/10/2026",
        )

        self.assertTrue(substituiu)
        self.assertEqual(paragrafo.text, "Início 28/10/2026 às 08h00.")
        self.assertNotIn("{{DATA REC PROP1}}", paragrafo.text)

    def test_preserva_substituicao_em_runs_comuns(self):
        documento = Document()
        paragrafo = documento.add_paragraph()
        paragrafo.add_run("Data: {{DATA ")
        paragrafo.add_run("REC PROP1}}.")

        substituiu = _substituir_texto_mantendo_formatacao(
            paragrafo,
            "{{DATA REC PROP1}}",
            "28/10/2026",
        )

        self.assertTrue(substituiu)
        self.assertEqual(paragrafo.text, "Data: 28/10/2026.")


if __name__ == "__main__":
    unittest.main()
