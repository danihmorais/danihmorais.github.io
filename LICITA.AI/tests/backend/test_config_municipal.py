from __future__ import annotations

import sys
import unittest
from pathlib import Path

LICITA_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(LICITA_ROOT))

import config


class ConfiguracaoMunicipalTests(unittest.TestCase):
    def test_config_municipal_aplica_campos_textos_e_modelos(self):
        self.assertEqual(config.MUNICIPIO_ID, "sao-francisco-sp")
        self.assertEqual(config.MUNICIPIO_DISPLAY, "São Francisco/SP")
        self.assertEqual(config.LIMITE_EXCLUSIVIDADE_ME_EPP_CENTAVOS, 8000000)
        self.assertEqual(config.BASE_FILES, ["DFD - BASE.docx", "ETP - BASE.docx", "TR - BASE.docx"])
        self.assertEqual(config.BASE_FILES_CONTRATACAO_DIRETA, ["Contratação Direta - BASE.docx"])
        self.assertIn("Decreto Municipal nº 2.056/2024", config.TEXTOS["clausula_padrao"])
        self.assertIn("Av. Oscar Antônio da Costa", config.TEXTOS["vistoria_tr"])
        self.assertIn("(17) 3693-1101", config.TEXTOS["vistoria_tr"])
        self.assertIn("R$ 80.000,00", config.LIMITE_ME_EPP_TEXTO)

    def test_carregar_configuracao_municipal_por_id(self):
        municipio = config.carregar_configuracao_municipal("sao-francisco-sp")
        self.assertEqual(municipio["nome"], "São Francisco")
        self.assertEqual(municipio["modelos"]["pasta"], "modelos")
        with self.assertRaises(RuntimeError):
            config.carregar_configuracao_municipal("municipio-inexistente")


if __name__ == "__main__":
    unittest.main()
