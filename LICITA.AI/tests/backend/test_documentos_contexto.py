from __future__ import annotations

import io
import unittest
from unittest.mock import patch

from docx import Document

from documentos_contexto import extrair_anexos_dfd_etp_tr, extrair_contexto_documentos, extrair_texto_arquivo


def docx_bytes(*paragrafos: str) -> bytes:
    documento = Document()
    for paragrafo in paragrafos:
        documento.add_paragraph(paragrafo)
    buffer = io.BytesIO()
    documento.save(buffer)
    return buffer.getvalue()


class TestDocumentosContexto(unittest.TestCase):
    def test_extrai_documento_anterior_por_tipo(self):
        data = docx_bytes(
            "DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA",
            "Objeto anterior",
            "Justificativa anterior",
        )
        contexto = extrair_contexto_documentos(
            {
                "dfd": ("DFD anterior.docx", data),
                "etp": None,
                "tr": None,
                "edital": None,
            }
        )
        self.assertEqual(contexto["quantidade"], 1)
        self.assertEqual(contexto["documentos"][0]["tipo"], "DFD")
        self.assertEqual(contexto["documentos"][0]["origem"], "documento_anterior")
        self.assertIn("Objeto anterior", contexto["documentos"][0]["texto"])

    def test_edital_recorta_somente_anexos_dfd_etp_tr(self):
        edital = docx_bytes(
            "EDITAL DE LICITAÇÃO",
            "ANEXO I - DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (DFD)",
            "Objeto do DFD",
            "ANEXO II - ESTUDO TÉCNICO PRELIMINAR (ETP)",
            "Análise de mercado do ETP",
            "ANEXO III - TERMO DE REFERÊNCIA",
            "Condições do TR",
            "ANEXO IV - MODELO DE PROPOSTA",
            "Preço e condições da proposta",
        )
        contexto = extrair_contexto_documentos(
            {
                "dfd": None,
                "etp": None,
                "tr": None,
                "edital": ("Edital 10-2026.docx", edital),
            }
        )

        self.assertEqual([item["tipo"] for item in contexto["documentos"]], ["DFD", "ETP", "TR"])
        self.assertTrue(all(item["origem"] == "anexo_do_edital" for item in contexto["documentos"]))
        textos = "\n".join(item["texto"] for item in contexto["documentos"])
        self.assertIn("Objeto do DFD", textos)
        self.assertIn("Análise de mercado do ETP", textos)
        self.assertIn("Condições do TR", textos)
        self.assertNotIn("Preço e condições da proposta", textos)
        self.assertNotIn("EDITAL DE LICITAÇÃO", textos)

    def test_pdf_sem_texto_dispara_ocr_automaticamente(self):
        class Pagina:
            def extract_text(self):
                return ""

        class Leitor:
            def __init__(self, _stream):
                self.pages = [Pagina()]

        with patch("documentos_contexto.PdfReader", Leitor), patch(
            "documentos_contexto._ocr_pdf",
            return_value="Texto reconhecido por OCR.",
        ) as ocr:
            from documentos_contexto import _extrair_pdf

            texto = _extrair_pdf(b"%PDF-falso")

        self.assertEqual(texto, "Texto reconhecido por OCR.")
        ocr.assert_called_once()

    def test_extrair_anexos_rejeita_edital_sem_anexos_reconheciveis(self):
        texto = "EDITAL\nANEXO I - MODELO DE PROPOSTA\nPreço da proposta."
        with self.assertRaisesRegex(ValueError, "nenhum deles foi reconhecido"):
            extrair_anexos_dfd_etp_tr(texto, "edital.txt")

    def test_formato_nao_suportado(self):
        with self.assertRaisesRegex(ValueError, "Formato não suportado"):
            extrair_texto_arquivo("edital.rtf", b"texto")


if __name__ == "__main__":
    unittest.main()
