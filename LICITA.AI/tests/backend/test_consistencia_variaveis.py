import unittest

import config
import montador_variaveis


class ConsistenciaVariaveisTests(unittest.TestCase):
    def test_fiscais_sao_agregados_com_nome_e_cargo(self):
        dados = {
            "{{GESTOR}}": "Gestor A, Gestor B",
            "{{GESTOR_CARGO}}": "Cargo A, Cargo B",
            "{{FISCAL}}": "Fiscal A, Fiscal B",
            "{{FISCAL_CARGO}}": "Cargo F A, Cargo F B",
            "{{AMOST}}": "nao",
            "{{VIST}}": "nao",
            "{{PRORROGA}}": "nao",
            "{{ME_EPP}}": "NAO",
            "{{MODALIDADE}}": "PREGAO_ELETRONICO",
            "{{CRITERIOS}}": "ITEM",
            "{{INSTRUMENTO}}": "CONTRATO",
        }
        resultado = montador_variaveis.montar_variaveis_fixas(dados)
        self.assertEqual(resultado["{{GESTORES}}"], "Gestor A (Cargo A); Gestor B (Cargo B)")
        self.assertEqual(resultado["{{FISCAIS}}"], "Fiscal A (Cargo F A); Fiscal B (Cargo F B)")

    def test_alias_parcelamento_nao_herda_criterios_genericos(self):
        self.assertNotIn(("{{PARCELAMENTO}}", "{{CRITERIOS_JUSTIFICATIVA_ETP}}"), config.ALIASES)

    def test_alias_solucao_obsoleto_removido(self):
        self.assertNotIn(("{{SOLUCAO}}", "{{ESPECIFICACAO_TECNICA}}"), config.ALIASES)


if __name__ == "__main__":
    unittest.main()
