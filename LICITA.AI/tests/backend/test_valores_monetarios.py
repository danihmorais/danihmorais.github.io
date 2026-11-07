from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import patch

import fila_pipeline_unificado as pipeline
from montador_variaveis import (
    calcular_valor_estimado,
    calcular_valor_estimado_decimal,
    formatar_moeda,
    montar_variaveis_fixas,
    total_linha_item,
)


class TestParseValorDocumento(unittest.TestCase):
    def test_texto_brasileiro_usa_ponto_como_milhar(self):
        self.assertEqual(pipeline._parse_valor_documento("2.125"), Decimal("2125"))
        self.assertEqual(pipeline._parse_valor_documento("1.234,56"), Decimal("1234.56"))
        self.assertEqual(pipeline._parse_valor_documento("R$ 10.000,00"), Decimal("10000.00"))

    def test_numero_json_tipado_nao_passa_pela_heuristica_de_milhar(self):
        # 2.125 como número é R$ 2,125 (preço unitário com três casas), não 2125.
        self.assertEqual(pipeline._parse_valor_documento(2.125), Decimal("2.125"))
        self.assertEqual(pipeline._parse_valor_documento(1000), Decimal("1000"))
        self.assertIsNone(pipeline._parse_valor_documento(True))
        self.assertIsNone(pipeline._parse_valor_documento(None))
        self.assertIsNone(pipeline._parse_valor_documento(0))

    def test_formato_com_virgula_de_milhar_e_ponto_decimal(self):
        self.assertEqual(pipeline._parse_valor_documento("1,234.56"), Decimal("1234.56"))

    def test_virgula_decimal_com_tres_casas(self):
        self.assertEqual(pipeline._parse_valor_documento("0,125"), Decimal("0.125"))


class TestTotaisDoTR(unittest.TestCase):
    def test_linha_cuja_descricao_cita_quantidade_nao_e_descartada(self):
        tabela = (
            "Item | Descrição | Qtd | Valor unitário | Valor total\n"
            "1 | Papel, conforme quantidade mínima do edital | 10 | 2,00 | 20,00\n"
            "2 | Caneta | 5 | 3,00 | 15,00"
        )
        self.assertEqual(pipeline._total_itens_tabela_tr(tabela), Decimal("35.00"))

    def test_cabecalho_repetido_em_quebra_de_pagina_nao_soma_nem_zera(self):
        tabela = (
            "Item | Descrição | Qtd | Valor unitário | Valor total\n"
            "1 | Papel | 10 | 2,00 | 20,00\n"
            "Item | Descrição | Qtd | Valor unitário | Valor total\n"
            "2 | Caneta | 5 | 3,00 | 15,00"
        )
        self.assertEqual(pipeline._total_itens_tabela_tr(tabela), Decimal("35.00"))

    def test_percentual_na_linha_do_total_nao_e_confundido_com_valor(self):
        texto = "Valor total estimado: R$ 120.000,00, com margem de 5,00%"
        self.assertEqual(pipeline._total_explicito_tr(texto), Decimal("120000.00"))

    def test_ia_devolvendo_numeros_json_soma_corretamente(self):
        resposta = {
            "todos_itens_identificados": True,
            "itens": [{"numero": "1", "descricao": "X", "quantidade": 1000, "valor_unitario": 2.125, "valor_total": None}],
        }
        with patch.object(pipeline, "_chamar_ia", return_value=(resposta, "modelo")):
            total, _ = pipeline._total_itens_tr_por_ia([{"tipo": "TR", "texto": "abc", "nome": "n"}], "modelo")
        self.assertEqual(total, Decimal("2125.00"))


class TestArredondamentoDecimal(unittest.TestCase):
    def test_meio_centavo_arredonda_para_cima_sem_ruido_de_float(self):
        # float: 2.675 -> "2.67"; em Decimal ROUND_HALF_UP: 2,68
        self.assertEqual(total_linha_item({"qtd": 1, "valor": 2.675}), Decimal("2.68"))
        self.assertEqual(formatar_moeda(Decimal("2.675")), "R$ 2,68")

    def test_soma_das_linhas_fecha_com_a_tabela(self):
        dados = {"{{ITENS}}": '[{"qtd": 3, "valor": 0.1}, {"qtd": 1.5, "valor": 3.33}]'}
        # 0,30 + 4,995 -> 5,00 (linha arredondada) = 5,30
        self.assertEqual(calcular_valor_estimado_decimal(dados), Decimal("5.30"))
        self.assertEqual(calcular_valor_estimado(dados), 5.3)

    def test_valores_invalidos_valem_zero(self):
        dados = {"{{ITENS}}": '[{"qtd": "abc", "valor": 2}, {"qtd": 2, "valor": "nan"}, {"qtd": 2, "valor": 5}]'}
        self.assertEqual(calcular_valor_estimado_decimal(dados), Decimal("10.00"))

    def test_valor_estimado_do_documento_vem_dos_itens(self):
        dados = {
            "{{ITENS}}": '[{"qtd": 1000, "valor": 2.125}]',
            "{{VALOR_ESTIMADO}}": "R$ 1,00",  # valor enviado pelo navegador (float) é substituído
            "{{AMOST}}": "nao", "{{VIST}}": "nao", "{{PRORROGA}}": "nao", "{{ME_EPP}}": "NAO",
        }
        self.assertEqual(montar_variaveis_fixas(dados)["{{VALOR_ESTIMADO}}"], "R$ 2.125,00")

    def test_sem_itens_valorizados_preserva_valor_informado(self):
        dados = {"{{ITENS}}": "[]", "{{VALOR_ESTIMADO}}": "R$ 99,00", "{{AMOST}}": "nao", "{{VIST}}": "nao",
                 "{{PRORROGA}}": "nao", "{{ME_EPP}}": "NAO"}
        self.assertEqual(montar_variaveis_fixas(dados)["{{VALOR_ESTIMADO}}"], "R$ 99,00")


if __name__ == "__main__":
    unittest.main()
