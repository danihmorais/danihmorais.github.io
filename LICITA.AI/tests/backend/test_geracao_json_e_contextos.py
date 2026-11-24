from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import httpx

import fila_pipeline as pipeline
from fila_pipeline import ErroPermanente, JSONCorrompidoError, _extrair_json, _substituir_contextos


class TestExtrairJsonRobusto(unittest.TestCase):
    def test_preambulo_com_chaves_nao_quebra_o_recorte(self):
        bruto = 'Plano: usar {{OBJETO}} e depois {x}.\n{"A": "ok"}'
        self.assertEqual(_extrair_json(bruto), {"A": "ok"})

    def test_bloco_think_com_json_de_rascunho_e_ignorado(self):
        bruto = '<think>vou montar {"A": "rascunho"} e conferir</think>\n{"A": "final"}'
        self.assertEqual(_extrair_json(bruto), {"A": "final"})

    def test_think_sem_tag_de_abertura(self):
        bruto = 'raciocínio com {chaves} soltas</think>{"A": "final"}'
        self.assertEqual(_extrair_json(bruto), {"A": "final"})

    def test_cerca_de_codigo_markdown(self):
        self.assertEqual(_extrair_json('```json\n{"A": "x"}\n```'), {"A": "x"})

    def test_virgula_final_nao_altera_conteudo_de_strings(self):
        # O ", ]" e o ", }" fazem parte do TEXTO e não podem ser "corrigidos".
        bruto = '{"A": "lista [1, ] fim, }", "B": "x",}'
        self.assertEqual(_extrair_json(bruto), {"A": "lista [1, ] fim, }", "B": "x"})

    def test_virgula_final_em_array_aninhado(self):
        self.assertEqual(_extrair_json('{"A": ["x", "y",],}'), {"A": ["x", "y"]})

    def test_json_irrecuperavel_levanta_erro_especifico(self):
        with self.assertRaises(JSONCorrompidoError):
            _extrair_json('{"primeiro":"texto" "segundo":"texto"}')

    def test_array_na_raiz_nao_e_objeto(self):
        with self.assertRaisesRegex(RuntimeError, "não retornou um objeto JSON"):
            _extrair_json("[1, 2, 3]")


class TestSubstituirContextos(unittest.TestCase):
    def test_marcador_digitado_nos_dados_do_usuario_nao_e_reexpandido(self):
        dados = {"{{OBJETO}}": "ver __LICITA_PIPE_ETAPAS__ aqui"}
        resultado = _substituir_contextos(
            "DADOS:__LICITA_PIPE_DADOS_USUARIO__",
            dados,
            {"DFD": {"SEGREDO": "valor-que-nao-deve-vazar"}},
        )
        self.assertIn("__LICITA_PIPE_ETAPAS__", resultado)
        self.assertNotIn("valor-que-nao-deve-vazar", resultado)

    def test_marcadores_do_modelo_continuam_sendo_substituidos(self):
        resultado = _substituir_contextos(
            "A=__LICITA_PIPE_DFD__ B=__LICITA_PIPE_DESCONHECIDO__",
            {},
            {"DFD": {"OBJETO": "x"}},
        )
        self.assertIn('"OBJETO": "x"', resultado)
        self.assertIn("__LICITA_PIPE_DESCONHECIDO__", resultado)


class TestChamarIaFalhasDeRede(unittest.TestCase):
    def _chamar(self, erro):
        with (
            patch.object(pipeline, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(pipeline, "API_UNSLOTH_KEY", "chave"),
            patch.object(pipeline.httpx, "Client") as cliente_http,
        ):
            cliente_http.return_value.__enter__.return_value.post.side_effect = erro
            return pipeline._chamar_ia("prompt", "modelo")

    def test_timeout_vira_erro_com_mensagem_legivel(self):
        with self.assertRaisesRegex(RuntimeError, "não respondeu dentro do tempo limite"):
            self._chamar(httpx.ReadTimeout(""))

    def test_falha_de_conexao_informa_o_tipo_do_erro(self):
        with self.assertRaisesRegex(RuntimeError, "ConnectError"):
            self._chamar(httpx.ConnectError("recusada"))

    def test_resposta_json_que_nao_e_objeto_e_rejeitada(self):
        resposta = MagicMock(status_code=200)
        resposta.json.return_value = ["inesperado"]
        with self.assertRaisesRegex(RuntimeError, "JSON inválido"):
            self._chamar_resposta(resposta)

    def _chamar_resposta(self, resposta):
        with (
            patch.object(pipeline, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(pipeline, "API_UNSLOTH_KEY", "chave"),
            patch.object(pipeline.httpx, "Client") as cliente_http,
        ):
            cliente_http.return_value.__enter__.return_value.post.return_value = resposta
            return pipeline._chamar_ia("prompt", "modelo")

    def test_prompt_acima_do_limite_e_erro_permanente(self):
        with (
            patch.object(pipeline, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(pipeline, "API_UNSLOTH_KEY", "chave"),
        ):
            with self.assertRaises(ErroPermanente):
                pipeline._chamar_ia("x" * (pipeline.limite_prompt_chars() + 1), "modelo")

    def test_provedor_nao_configurado_e_erro_permanente(self):
        with patch.object(pipeline, "API_UNSLOTH_KEY", ""):
            with self.assertRaises(ErroPermanente):
                pipeline._chamar_ia("prompt", "modelo")


if __name__ == "__main__":
    unittest.main()
