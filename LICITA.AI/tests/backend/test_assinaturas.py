import json
import unittest

import montador_variaveis as mv


class AssinaturasTest(unittest.TestCase):
    def test_lista_estruturada_preserva_virgula_no_nome(self):
        dados = {
            "GESTORES_DADOS": json.dumps([{"nome": "Silva, João", "cargo": "Diretor"}]),
            "FISCAIS_DADOS": json.dumps([{"nome": "Maria", "cargo": ""}]),
        }
        r = mv.montar_variaveis_fixas(dados)
        self.assertIn("Silva, João", r["{{ASSINATURAS}}"])
        self.assertIn("Diretor\nGestor do Contrato", r["{{ASSINATURAS}}"])
        self.assertIn("Maria\nFiscal do Contrato", r["{{ASSINATURAS}}"])
        self.assertEqual(r["{{GESTORES}}"], "Silva, João (Diretor)")
        self.assertEqual(r["{{FISCAIS}}"], "Maria")

    def test_fallback_por_virgula_sem_cargo_mostra_papel(self):
        dados = {"{{GESTOR}}": "Ana, Bia", "{{GESTOR_CARGO}}": "[Não informado]"}
        r = mv.montar_variaveis_fixas(dados)
        self.assertNotIn("[Não informado]", r["{{ASSINATURAS}}"])
        self.assertEqual(r["{{ASSINATURAS}}"].count("Gestor do Contrato"), 2)
        self.assertEqual(r["{{FISCAIS}}"], "[Não informado]")

    def test_sem_pessoas(self):
        r = mv.montar_variaveis_fixas({})
        self.assertEqual(r["{{ASSINATURAS}}"], "")


if __name__ == "__main__":
    unittest.main()
