from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path

from docx import Document

import fila
from documentos_contexto import ANEXO_RE, extrair_anexos_dfd_etp_tr
from processador_docx import extrair_placeholders_documento, modificar_documento, replace_text_in_paragraph


class TestSubstituicaoDocx(unittest.TestCase):
    def test_placeholder_repetido_no_mesmo_paragrafo_e_substituido_todas_as_vezes(self):
        paragrafo = Document().add_paragraph("{{A}} e novamente {{A}} e {{B}}")
        replace_text_in_paragraph(paragrafo, {"{{A}}": "X", "{{B}}": "Y"})
        self.assertEqual(paragrafo.text, "X e novamente X e Y")

    def test_valor_que_contem_o_proprio_placeholder_nao_entra_em_laco(self):
        paragrafo = Document().add_paragraph("{{A}} fim")
        replace_text_in_paragraph(paragrafo, {"{{A}}": "veja {{A}}"})
        self.assertEqual(paragrafo.text, "veja {{A}} fim")

    def test_caracteres_de_controle_de_texto_colado_sao_removidos(self):
        paragrafo = Document().add_paragraph("x {{A}}")
        replace_text_in_paragraph(paragrafo, {"{{A}}": "a\x0cb\x0bc\x00d"})
        self.assertEqual(paragrafo.text, "x abcd")

    def test_tabela_de_itens_em_celula_nao_gera_erro_vermelho(self):
        documento = Document()
        celula = documento.add_table(rows=1, cols=1).rows[0].cells[0]
        celula.paragraphs[0].text = "{{ITENS}}"
        replace_text_in_paragraph(celula.paragraphs[0], {"{{ITENS}}": '__TABLE__[{"Item": "1", "Descrição": "Papel"}]'})
        self.assertNotIn("ERRO AO GERAR TABELA", celula.text)
        self.assertEqual(len(celula.tables), 1)
        self.assertEqual(celula.tables[0].rows[1].cells[1].text, "Papel")

    def test_modificar_documento_alcanca_tabelas_aninhadas(self):
        documento = Document()
        externa = documento.add_table(rows=1, cols=1).rows[0].cells[0]
        interna = externa.add_table(rows=1, cols=1).rows[0].cells[0]
        interna.paragraphs[0].text = "Objeto: {{OBJETO}}"
        with tempfile.TemporaryDirectory() as pasta:
            origem, destino = Path(pasta) / "modelo.docx", Path(pasta) / "pronto.docx"
            documento.save(origem)
            self.assertEqual(extrair_placeholders_documento(str(origem)), {"{{OBJETO}}"})
            modificar_documento(str(origem), str(destino), {"{{OBJETO}}": "Papel"})
            self.assertEqual(extrair_placeholders_documento(str(destino)), set())
            texto = Document(str(destino)).tables[0].rows[0].cells[0].tables[0].rows[0].cells[0].text
            self.assertEqual(texto, "Objeto: Papel")


class TestQuebrasEscapadas(unittest.TestCase):
    def test_converte_escapes_duplicados_de_quebra(self):
        self.assertEqual(fila._normalizar_quebras_escapadas("a\\nb\\r\\nc"), "a\nb\nc")

    def test_barra_antes_de_r_nao_vira_quebra(self):
        self.assertEqual(fila._normalizar_quebras_escapadas("Pasta C:\\rel\\rua"), "Pasta C:\\rel\\rua")


class TestAnexosDoEdital(unittest.TestCase):
    def _anexos(self, texto):
        return extrair_anexos_dfd_etp_tr(texto, "edital.pdf")

    def test_frase_do_corpo_iniciada_por_anexo_nao_corta_o_tr(self):
        edital = (
            "ANEXO I - TERMO DE REFERÊNCIA\n"
            "1. Objeto: aquisição de materiais.\n"
            "Anexo II da Resolução 12/2020 define critérios de sustentabilidade.\n"
            "Anexos deste edital integram o processo.\n"
            "2. Obrigações da contratada: entregar no prazo.\n"
        )
        documentos = self._anexos(edital)
        self.assertEqual([d["tipo"] for d in documentos], ["TR"])
        self.assertIn("Obrigações da contratada", documentos[0]["texto"])
        self.assertIn("Resolução 12/2020", documentos[0]["texto"])

    def test_minuta_que_cita_o_termo_de_referencia_nao_vira_tr(self):
        edital = (
            "ANEXO I - TERMO DE REFERÊNCIA\nObjeto da contratação.\n"
            "ANEXO II - MINUTA DO CONTRATO\n"
            "CLÁUSULA PRIMEIRA - O objeto segue o Termo de Referência, parte integrante deste contrato.\n"
        )
        documentos = self._anexos(edital)
        self.assertEqual([d["tipo"] for d in documentos], ["TR"])
        self.assertNotIn("MINUTA", documentos[0]["texto"])

    def test_titulo_em_maiusculas_na_mesma_linha_do_anexo(self):
        documentos = self._anexos("ANEXO III TERMO DE REFERÊNCIA\nCondições gerais.\n")
        self.assertEqual([d["tipo"] for d in documentos], ["TR"])

    def test_titulo_na_linha_seguinte_ao_cabecalho(self):
        documentos = self._anexos("ANEXO II\nESTUDO TÉCNICO PRELIMINAR\nAnálise de mercado.\n")
        self.assertEqual([d["tipo"] for d in documentos], ["ETP"])

    def test_titulo_com_capitalizacao_mista(self):
        documentos = self._anexos("Anexo I – Documento de Formalização da Demanda\nObjeto.\n")
        self.assertEqual([d["tipo"] for d in documentos], ["DFD"])

    def test_regex_aceita_cabecalhos_e_rejeita_frases(self):
        for cabecalho in ("ANEXO I", "ANEXO IV - MODELO DE PROPOSTA", "Anexo único: Planilha", "ANEXO 3", "ANEXO A - X"):
            with self.subTest(cabecalho=cabecalho):
                self.assertIsNotNone(ANEXO_RE.search(cabecalho))
        for frase in (
            "Anexo II da Resolução 12/2020 define critérios.",
            "Anexos deste edital integram o processo.",
            "anexo ao presente, segue a planilha.",
            "ANEXO DE PREÇOS conforme tabela abaixo.",
        ):
            with self.subTest(frase=frase):
                self.assertIsNone(ANEXO_RE.search(frase))


if __name__ == "__main__":
    unittest.main()
