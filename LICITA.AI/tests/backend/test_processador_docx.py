from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from docx import Document

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

from processador_docx import replace_text_in_paragraph


class ProcessadorDocxTests(unittest.TestCase):
    def test_tabela_aceita_linhas_com_chaves_diferentes(self):
        doc = Document()
        paragraph = doc.add_paragraph("{{ITENS}}")
        dados = [
            {"Item": 1, "Descrição": "Caneta"},
            {"Item": 2, "Descrição": "Papel", "Observação": "Entrega imediata"},
        ]

        replace_text_in_paragraph(
            paragraph,
            {"{{ITENS}}": "__TABLE__" + json.dumps(dados, ensure_ascii=False)},
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            caminho = Path(temp_dir) / "teste.docx"
            doc.save(caminho)
            reaberto = Document(caminho)

        self.assertEqual(len(reaberto.tables), 1)
        tabela = reaberto.tables[0]
        self.assertEqual(len(tabela.columns), 3)
        self.assertEqual(tabela.cell(0, 2).text, "Observação")
        self.assertEqual(tabela.cell(1, 2).text, "")
        self.assertEqual(tabela.cell(2, 2).text, "Entrega imediata")


if __name__ == "__main__":
    unittest.main()
