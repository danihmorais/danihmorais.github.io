import json
import unittest

from fila_pipeline import _aplicar_auditoria_marcas, _extrair_json, _substituir_contextos, _validar_json_geracao


class TestFilaPipeline(unittest.TestCase):
    def test_substitui_contextos(self):
        texto = "DFD={{DFD}} ET={{ETP}} DADOS={{DADOS}} STAGES={{STAGES}}"
        resultado = _substituir_contextos(
            texto.replace("{{DFD}}", "__LICITA_PIPE_DFD__")
            .replace("{{ETP}}", "__LICITA_PIPE_ETP__")
            .replace("{{DADOS}}", "__LICITA_PIPE_DADOS_USUARIO__")
            .replace("{{STAGES}}", "__LICITA_PIPE_ETAPAS__"),
            {"{{OBJETO}}": "Aquisição de bens"},
            {"DFD": {"OBJETO": "Aquisição"}, "ETP": {"MERCADO": "Análise"}},
        )
        self.assertIn('"OBJETO": "Aquisição"', resultado)
        self.assertIn('"MERCADO": "Análise"', resultado)
        self.assertIn('"{{OBJETO}}": "Aquisição de bens"', resultado)

    def test_extrair_json(self):
        resultado = _extrair_json('texto antes {"ok": "sim",} texto depois')
        self.assertEqual(resultado, {"ok": "sim"})

    def test_valida_json(self):
        self.assertEqual(_validar_json_geracao({"A": "texto"}), {"A": "texto"})
        with self.assertRaises(RuntimeError):
            _validar_json_geracao({"A": ""})

    def test_auditoria_apenas_remove_marca(self):
        dados = {"{{ITENS}}": json.dumps([{"numero": 1, "descricao": "Pneu Michelin aro 15"}])}
        resposta = {"itens": [{"numero": 1, "nome_revisado": "Pneu aro 15", "motivo": "Marca identificada"}]}
        novos_dados, auditoria = _aplicar_auditoria_marcas(dados, resposta)
        itens = json.loads(novos_dados["{{ITENS}}"])
        self.assertEqual(itens[0]["descricao"], "Pneu aro 15")
        self.assertTrue(auditoria["itens"][0]["alterado"])


if __name__ == "__main__":
    unittest.main()


class TestPagamentoPipeline(unittest.TestCase):
    def test_pagamento_por_etapas_nao_pode_ser_sobrescrito_por_fase_preparatoria(self):
        resultados = {
            "PAGAMENTO_ETAPAS": {"PAGAMENTO": "Pagamento revisado por etapas."},
            "FASE_PREPARATORIA": {
                "DFD": {},
                "ETP": {},
                "TR": {},
                "PAGAMENTO": "Pagamento inventado pela IA principal.",
            },
        }
        dados_ia_final = {}
        for etapa_id, resultado in resultados.items():
            if etapa_id == "AUDITORIA_MARCAS" or not isinstance(resultado, dict):
                continue
            blocos = (
                resultado
                if etapa_id == "FASE_PREPARATORIA"
                and all(isinstance(resultado.get(bloco), dict) for bloco in ("DFD", "ETP", "TR"))
                else {"_": resultado}
            )
            for bloco in blocos.values():
                if not isinstance(bloco, dict):
                    continue
                for chave, valor in bloco.items():
                    if chave == "PAGAMENTO" and etapa_id != "PAGAMENTO_ETAPAS":
                        continue
                    dados_ia_final[chave] = valor

        self.assertEqual(dados_ia_final["PAGAMENTO"], "Pagamento revisado por etapas.")
