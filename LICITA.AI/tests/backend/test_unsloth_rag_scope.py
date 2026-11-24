import asyncio
import unittest
from unittest.mock import MagicMock, patch

import fila_pipeline
import main


class TestUnslothRagScope(unittest.TestCase):
    def _resposta(self):
        resposta = MagicMock()
        resposta.status_code = 200
        resposta.json.return_value = {
            "choices": [{"message": {"content": '{"ok": true}'}}],
            "model": "modelo-teste",
        }
        return resposta

    def test_fila_nao_envia_rag_scope_sem_kb_configurada(self):
        with (
            patch.object(fila_pipeline, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(fila_pipeline, "API_UNSLOTH_KEY", "chave"),
            patch.object(fila_pipeline, "UNSLOTH_RAG_KB_ID", ""),
            patch.object(fila_pipeline.httpx, "Client") as cliente_http,
        ):
            cliente_http.return_value.__enter__.return_value.post.return_value = self._resposta()
            fila_pipeline._chamar_ia("prompt", "modelo-teste")
            payload = cliente_http.return_value.__enter__.return_value.post.call_args.kwargs["json"]
        self.assertNotIn("rag_scope", payload)

    def test_fila_envia_rag_scope_quando_kb_configurada(self):
        with (
            patch.object(fila_pipeline, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(fila_pipeline, "API_UNSLOTH_KEY", "chave"),
            patch.object(fila_pipeline, "UNSLOTH_RAG_KB_ID", "kb-licitacao"),
            patch.object(fila_pipeline, "UNSLOTH_RAG_TOP_K", 7),
            patch.object(fila_pipeline.httpx, "Client") as cliente_http,
        ):
            cliente_http.return_value.__enter__.return_value.post.return_value = self._resposta()
            fila_pipeline._chamar_ia("prompt", "modelo-teste")
            payload = cliente_http.return_value.__enter__.return_value.post.call_args.kwargs["json"]
        self.assertEqual(payload["rag_scope"], {
            "kb_id": "kb-licitacao",
            "autoinject": True,
            "default_top_k": 7,
        })


class TestUnslothRagScopeApi(unittest.IsolatedAsyncioTestCase):
    async def _gerar(self):
        req = main.IAChatRequest(model="unsloth-auto", prompt="prompt de teste")
        capturado = {}

        async def upstream(base_url, api_key, payload):
            capturado.update(payload)
            return {
                "choices": [{"message": {"content": '{"ok": true}'}}],
                "model": "modelo-teste",
            }, 200

        with (
            patch.object(main, "API_UNSLOTH_URL", "http://unsloth.test/v1"),
            patch.object(main, "API_UNSLOTH_KEY", "chave"),
            patch.object(main, "_upstream_chat", side_effect=upstream),
        ):
            await main._gerar_ia(req)
        return capturado

    async def test_api_nao_envia_rag_scope_sem_kb_configurada(self):
        with patch.object(main, "UNSLOTH_RAG_KB_ID", ""):
            payload = await self._gerar()
        self.assertNotIn("rag_scope", payload)

    async def test_api_envia_rag_scope_quando_kb_configurada(self):
        with (
            patch.object(main, "UNSLOTH_RAG_KB_ID", "kb-licitacao"),
            patch.object(main, "UNSLOTH_RAG_TOP_K", 5),
        ):
            payload = await self._gerar()
        self.assertEqual(payload["rag_scope"], {
            "kb_id": "kb-licitacao",
            "autoinject": True,
            "default_top_k": 5,
        })


if __name__ == "__main__":
    unittest.main()
