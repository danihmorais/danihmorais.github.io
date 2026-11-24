from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import openrouter_client as cliente

_VARIAVEIS = (
    "API_KEY", "BASE_URL", "MODEL", "SITE_URL", "APP_TITLE", "REASONING_EFFORT", "WEB_SEARCH",
    "WEB_MAX_RESULTS", "WEB_MAX_TOTAL_RESULTS", "WEB_ENGINE", "REQUIRE_PARAMETERS", "DATA_COLLECTION", "MAX_TOKENS",
)
MENSAGENS = [{"role": "user", "content": "olá"}]
SCHEMA = {"type": "json_schema", "json_schema": {"name": "x", "strict": True, "schema": {"type": "object"}}}


def ambiente(**valores: str):
    """Ambiente limpo de qualquer variável OpenRouter, com os valores informados."""
    base = {}
    for sufixo in _VARIAVEIS:
        base[f"OPENROUTER_{sufixo}"] = ""
        base[f"LICITA_OPENROUTER_{sufixo}"] = ""
    base.update({f"OPENROUTER_{chave}": valor for chave, valor in valores.items()})
    return patch.dict(os.environ, base)


class TestConfiguracao(unittest.TestCase):
    def test_padroes(self):
        with ambiente():
            self.assertEqual(cliente.base_url(), "https://openrouter.ai/api/v1")
            self.assertEqual(cliente.url_chat_completions(), "https://openrouter.ai/api/v1/chat/completions")
            self.assertEqual(cliente.modelo_configurado(), "openrouter/auto")
            self.assertFalse(cliente.configurado())

    def test_prefixo_licita_tem_precedencia(self):
        with ambiente(API_KEY="geral", MODEL="geral/modelo"), patch.dict(
            os.environ, {"LICITA_OPENROUTER_API_KEY": "especifica", "LICITA_OPENROUTER_MODEL": "especifico/modelo"}
        ):
            self.assertEqual(cliente.api_key(), "especifica")
            self.assertEqual(cliente.modelo_configurado(), "especifico/modelo")
            self.assertTrue(cliente.configurado())

    def test_aliases_automaticos_resolvem_para_o_modelo_configurado(self):
        with ambiente(MODEL="provedor/modelo"):
            for alias in ("", None, "auto", "AUTO", " openrouter-auto ", "unsloth-auto"):
                self.assertEqual(cliente.resolver_modelo(alias), "provedor/modelo", alias)
            self.assertEqual(cliente.resolver_modelo("outro/modelo"), "outro/modelo")

    def test_modelo_para_fixar(self):
        self.assertEqual(cliente.modelo_para_fixar("openrouter/auto", "anthropic/escolhido"), "anthropic/escolhido")
        self.assertEqual(cliente.modelo_para_fixar("openrouter/auto", ""), "openrouter/auto")
        self.assertEqual(cliente.modelo_para_fixar("provedor/modelo", "provedor/modelo-datado"), "provedor/modelo")

    def test_cabecalhos(self):
        with ambiente(API_KEY="segredo", SITE_URL="https://exemplo.test", APP_TITLE="Meu App"):
            cabecalhos = cliente.headers()
        self.assertEqual(cabecalhos["Authorization"], "Bearer segredo")
        self.assertEqual(cabecalhos["HTTP-Referer"], "https://exemplo.test")
        self.assertEqual(cabecalhos["X-Title"], "Meu App")
        self.assertEqual(cabecalhos["Content-Type"], "application/json")


class TestMontarPayload(unittest.TestCase):
    def test_payload_basico_sem_parametros_proprietarios(self):
        with ambiente(MODEL="provedor/modelo"):
            payload = cliente.montar_payload("auto", MENSAGENS, temperature=0.3)
        self.assertEqual(payload["model"], "provedor/modelo")
        self.assertEqual(payload["temperature"], 0.3)
        self.assertEqual(payload["messages"], MENSAGENS)
        for ausente in ("enable_thinking", "enable_tools", "tools", "response_format", "provider", "max_tokens"):
            self.assertNotIn(ausente, payload)

    def test_raciocinio_ligado_e_desligado(self):
        with ambiente():
            ligado = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_thinking=True)
            desligado = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_thinking=False)
        self.assertEqual(ligado["reasoning"], {"effort": "medium", "exclude": True})
        self.assertEqual(desligado["reasoning"], {"enabled": False})

    def test_esforco_de_raciocinio_configuravel_e_invalido_cai_em_medium(self):
        with ambiente(REASONING_EFFORT="HIGH"):
            self.assertEqual(cliente.montar_payload("m", MENSAGENS, temperature=0)["reasoning"]["effort"], "high")
        with ambiente(REASONING_EFFORT="qualquer-coisa"):
            self.assertEqual(cliente.montar_payload("m", MENSAGENS, temperature=0)["reasoning"]["effort"], "medium")

    def test_reasoning_off_omite_o_parametro_em_qualquer_caso(self):
        with ambiente(REASONING_EFFORT="off"):
            self.assertNotIn("reasoning", cliente.montar_payload("m", MENSAGENS, temperature=0, enable_thinking=True))
            self.assertNotIn("reasoning", cliente.montar_payload("m", MENSAGENS, temperature=0, enable_thinking=False))

    def test_pesquisa_web_so_quando_solicitada(self):
        with ambiente():
            sem = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_tools=False)
            com = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_tools=True)
        self.assertNotIn("tools", sem)
        self.assertEqual(
            com["tools"],
            [{"type": "openrouter:web_search", "parameters": {"max_results": 5, "max_total_results": 20}}],
        )

    def test_pesquisa_web_pode_ser_desligada_e_ajustada(self):
        with ambiente(WEB_SEARCH="0"):
            self.assertNotIn("tools", cliente.montar_payload("m", MENSAGENS, temperature=0, enable_tools=True))
        with ambiente(WEB_MAX_RESULTS="3", WEB_MAX_TOTAL_RESULTS="9", WEB_ENGINE="exa"):
            parametros = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_tools=True)["tools"][0]["parameters"]
        self.assertEqual(parametros, {"max_results": 3, "max_total_results": 9, "engine": "exa"})
        with ambiente(WEB_MAX_RESULTS="999", WEB_MAX_TOTAL_RESULTS="abc"):
            parametros = cliente.montar_payload("m", MENSAGENS, temperature=0, enable_tools=True)["tools"][0]["parameters"]
        self.assertEqual((parametros["max_results"], parametros["max_total_results"]), (25, 20))

    def test_schema_estrito_exige_provedores_que_suportam_todos_os_parametros(self):
        with ambiente():
            payload = cliente.montar_payload("m", MENSAGENS, temperature=0, response_format=SCHEMA)
        self.assertEqual(payload["response_format"], SCHEMA)
        self.assertEqual(payload["provider"], {"require_parameters": True})

    def test_require_parameters_configuravel(self):
        with ambiente(REQUIRE_PARAMETERS="false"):
            payload = cliente.montar_payload("m", MENSAGENS, temperature=0, response_format=SCHEMA)
        self.assertNotIn("provider", payload)
        with ambiente(REQUIRE_PARAMETERS="true"):
            payload = cliente.montar_payload("m", MENSAGENS, temperature=0)
        self.assertEqual(payload["provider"], {"require_parameters": True})

    def test_coleta_de_dados_e_teto_de_tokens_opcionais(self):
        with ambiente(DATA_COLLECTION="deny", MAX_TOKENS="32000"):
            payload = cliente.montar_payload("m", MENSAGENS, temperature=0)
        self.assertEqual(payload["provider"], {"data_collection": "deny"})
        self.assertEqual(payload["max_tokens"], 32000)
        with ambiente(DATA_COLLECTION="talvez", MAX_TOKENS="muito"):
            payload = cliente.montar_payload("m", MENSAGENS, temperature=0)
        self.assertNotIn("provider", payload)
        self.assertNotIn("max_tokens", payload)


class TestErros(unittest.TestCase):
    def test_detalhe_erro_do_formato_openrouter(self):
        corpo = '{"error":{"code":400,"message":"Bad schema","metadata":{"raw":"campo x"}}}'
        self.assertEqual(cliente.detalhe_erro(corpo), "Bad schema (campo x)")
        self.assertEqual(cliente.detalhe_erro('{"error":"texto simples"}'), "texto simples")
        self.assertEqual(cliente.detalhe_erro("<html>502</html>"), "<html>502</html>")
        self.assertEqual(cliente.detalhe_erro(b'{"error":{"message":"em bytes"}}'), "em bytes")

    def test_descrever_erro_http_inclui_orientacao_para_erros_de_configuracao(self):
        self.assertIn("OPENROUTER_API_KEY", cliente.descrever_erro_http(401, '{"error":{"message":"No auth"}}'))
        self.assertIn("Créditos insuficientes", cliente.descrever_erro_http(402, ""))
        self.assertIn("OPENROUTER_MODEL", cliente.descrever_erro_http(404, ""))
        self.assertEqual(cliente.descrever_erro_http(500, "falhou"), "IA HTTP 500: falhou")

    def test_erro_embutido(self):
        self.assertEqual(
            cliente.erro_embutido({"error": {"code": 429, "message": "Rate limited"}}),
            (429, "Rate limited"),
        )
        self.assertEqual(cliente.erro_embutido({"error": {"message": "sem código"}})[0], 502)
        self.assertIsNone(cliente.erro_embutido({"choices": [{"message": {"content": "x"}}]}))
        self.assertIsNone(cliente.erro_embutido({"choices": [{}], "error": {"message": "ignorado"}}))
        self.assertIsNone(cliente.erro_embutido(["não é dict"]))


if __name__ == "__main__":
    unittest.main()
