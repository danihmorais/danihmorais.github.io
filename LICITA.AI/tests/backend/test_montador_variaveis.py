from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

from montador_variaveis import amostra_exigida, filtrar_chaves_docx, montar_variaveis_fixas


class MontadorVariaveisTests(unittest.TestCase):
    def test_exclusividade_meepp_aceita_limite_e_rejeita_acima(self):
        limite = {
            "{{ME_EPP}}": "SIM",
            "{{ITENS}}": json.dumps([{"numero": 1, "qtd": 8, "valor": 10000}]),
        }
        acima = {
            "{{ME_EPP}}": "SIM",
            "{{ITENS}}": json.dumps([{"numero": 1, "qtd": 8, "valor": 10000.01}]),
        }

        resultado = montar_variaveis_fixas(limite)
        self.assertIn("SERÁ exclusiva para ME/EPP", resultado["{{ME_EPP_TR}}"])
        with self.assertRaisesRegex(ValueError, "supera R\$ 80.000,00"):
            montar_variaveis_fixas(acima)

    def test_ata_usa_clausula_especifica_e_nao_clausula_de_contrato(self):
        resultado = montar_variaveis_fixas({
            "{{INSTRUMENTO}}": "ATA",
            "{{PRORROGA}}": "SIM",
        })

        clausula = resultado["{{PRORROGA_CLAUS}}"]
        self.assertIn("Ata de Registro de Preços", clausula)
        self.assertIn("art. 84", clausula)
        self.assertNotIn("art. 68", clausula)
        self.assertNotIn("vigência contratual", clausula)

    def test_filtrar_chaves_docx_normaliza_chaves_sem_chaves(self):
        resultado = filtrar_chaves_docx({
            "OBJETO": "Aquisição de materiais",
            "{{NOME}}": "Teste",
            "  CAMPO_EXTRA  ": "Valor",
        })

        self.assertEqual(resultado["{{OBJETO}}"], "Aquisição de materiais")
        self.assertEqual(resultado["{{NOME}}"], "Teste")
        self.assertEqual(resultado["{{CAMPO_EXTRA}}"], "Valor")

    def test_amostra_tr_sem_exigencia_e_texto_fixo(self):
        frase = "Não há exigência de amostra para esta contratação."
        for dados in ({}, {"{{AMOST}}": "nao"}, {"{{AMOST}}": "não"}):
            with self.subTest(dados=dados):
                resultado = montar_variaveis_fixas(dados)
                self.assertEqual(resultado["{{AMOSTRA_TR}}"], frase)
                self.assertEqual(resultado["{{AMOSTRA}}"], "")

    def test_amostra_tr_com_exigencia_usa_texto_base_e_ia_redige_o_detalhe(self):
        resultado = montar_variaveis_fixas({"{{AMOST}}": "sim"})

        self.assertNotIn("Não há exigência", resultado["{{AMOSTRA_TR}}"])
        self.assertIn("Será exigida amostra", resultado["{{AMOSTRA_TR}}"])
        self.assertTrue(amostra_exigida({"{{AMOST}}": "sim"}))
        self.assertFalse(amostra_exigida({"{{AMOST}}": "nao"}))
        self.assertFalse(amostra_exigida({}))


if __name__ == "__main__":
    unittest.main()
