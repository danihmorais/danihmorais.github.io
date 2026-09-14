from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

QUEUE_DIR = Path(tempfile.mkdtemp(prefix="licita_ai_tests_"))
os.environ["LICITA_QUEUE_DIR"] = str(QUEUE_DIR)
os.environ["LICITA_QUEUE_POLL_SECONDS"] = "3600"
os.environ["LICITA_QUEUE_MAX_ATTEMPTS"] = "1"
os.environ["LICITA_UNSLOTH_KEY"] = "test-unsloth"
os.environ["LICITA_OPENROUTER_KEY"] = "test-openrouter"

import fila

fila._process_one_job = lambda: None

from fastapi.testclient import TestClient
import main
from main import app


class LicitaBackendTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(QUEUE_DIR, ignore_errors=True)

    def setUp(self):
        for path in QUEUE_DIR.glob("*"):
            if path.is_file():
                path.unlink()
        main._ia_rate_buckets.clear()

    def test_endpoint_rejeita_email_invalido(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/gerar-fase-preparatoria",
                json={"email": "nao-e-mail", "dados_ia": {}, "dados_usuario": {}},
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("e-mail válido", response.json()["detail"])

    def test_endpoint_rejeita_exclusividade_meepp_acima_do_limite(self):
        payload = {
            "email": "teste@example.com",
            "dados_ia": {},
            "dados_usuario": {
                "{{ME_EPP}}": "SIM",
                "{{ITENS}}": json.dumps([{"numero": 1, "qtd": 1, "valor": 80000.01}]),
            },
        }

        with TestClient(app) as client:
            response = client.post("/api/gerar-fase-preparatoria", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn("supera R$ 80.000,00", response.json()["detail"])
        self.assertEqual(list(QUEUE_DIR.glob("*.json")), [])

    def test_endpoint_agenda_e_consulta_job(self):
        payload = {
            "email": "teste@example.com",
            "instrucoes": "Teste automatizado",
            "dados_ia": {"JUSTIFICATIVA": "Teste"},
            "dados_usuario": {"{{OBJETO}}": "Objeto de teste"},
        }

        with TestClient(app) as client:
            created = client.post("/api/gerar-fase-preparatoria", json=payload)
            self.assertEqual(created.status_code, 200)
            first = created.json()
            job_id = first["job_id"]
            self.assertEqual(first["status"], "queued")
            self.assertEqual(first["fila_posicao"], 1)
            self.assertEqual(first["solicitacoes_a_frente"], 0)
            self.assertIn("Posição aproximada: 1º", first["message"])

            second = client.post("/api/gerar-fase-preparatoria", json=payload)
            self.assertEqual(second.status_code, 200)
            self.assertEqual(second.json()["fila_posicao"], 2)
            self.assertEqual(second.json()["solicitacoes_a_frente"], 1)

            consulted = client.get(f"/api/fila/{job_id}")
            self.assertEqual(consulted.status_code, 200)
            self.assertEqual(consulted.json()["job_id"], job_id)
            self.assertEqual(consulted.json()["status"], "queued")
            self.assertNotIn("email", consulted.json())

    def test_endpoint_rejeita_job_id_invalido(self):
        with TestClient(app) as client:
            response = client.get("/api/fila/nao-e-uuid-hexadecimal")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Solicitação não encontrada", response.json()["detail"])

    def test_status_ia_nao_expoe_segredos(self):
        with TestClient(app) as client:
            response = client.get("/api/ia/status")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertTrue(body["unsloth"])
        self.assertTrue(body["openrouter"])
        self.assertNotIn("key", json.dumps(body).lower())
        self.assertNotIn("test-unsloth", json.dumps(body))
        self.assertNotIn("test-openrouter", json.dumps(body))

    def test_chat_ia_rejeita_prompt_vazio(self):
        with TestClient(app) as client:
            response = client.post("/api/ia/chat", json={"prompt": "   ", "model": "unsloth-auto"})
        self.assertEqual(response.status_code, 422)
        self.assertIn("prompt", json.dumps(response.json()).lower())

    def test_chat_ia_aplica_rate_limit(self):
        original = main._gerar_ia

        async def mock_gerar_ia(req):
            return {"content": "{}", "model": req.model, "provider": "test"}

        main._gerar_ia = mock_gerar_ia
        try:
            with TestClient(app) as client:
                for _ in range(main.IA_RATE_LIMIT):
                    response = client.post("/api/ia/chat", json={"prompt": "teste", "model": "unsloth-auto"})
                    self.assertEqual(response.status_code, 200)
                bloqueado = client.post("/api/ia/chat", json={"prompt": "teste", "model": "unsloth-auto"})
        finally:
            main._gerar_ia = original
            main._ia_rate_buckets.clear()

        self.assertEqual(bloqueado.status_code, 429)
        self.assertIn("Retry-After", bloqueado.headers)

    def test_gerar_zip_produz_os_tres_documentos_base(self):
        dados_usuario = {
            "{{OBJETO}}": "Aquisição de materiais de expediente",
            "{{NECESSIDADE}}": "Reposição de estoque da Administração Municipal",
            "{{ITENS}}": json.dumps([{"numero": 1, "descricao": "Caneta esferográfica azul", "un": "UN", "qtd": 10, "valor": 2.50}]),
            "{{AMOST}}": "nao",
            "{{VIST}}": "nao",
            "{{PRORROGA}}": "nao",
            "{{ME_EPP}}": "NAO",
            "{{CRITERIOS}}": "ITEM",
            "{{MODALIDADE}}": "PREGAO_ELETRONICO",
            "{{INSTRUMENTO}}": "CONTRATO",
        }
        dados_ia = {
            "OBJETO": "Aquisição de materiais de expediente para o Município de São Francisco/SP",
            "JUSTIFICATIVA": "Justificativa de teste automatizado.",
            "ESTIMATIVA_QUANTIDADES": "Estimativa baseada em histórico de consumo.",
            "RESULTADOS_ESPERADOS": "Economicidade e continuidade administrativa.",
        }

        zip_path, zip_filename = fila.gerar_zip(dados_usuario, dados_ia, "a" * 32)
        try:
            self.assertEqual(zip_filename, zip_path.name)
            self.assertTrue(zip_path.is_file())
            with zipfile.ZipFile(zip_path) as archive:
                names = set(archive.namelist())

            expected = {
                "Pronto_DFD - BASE.docx",
                "Pronto_ETP - BASE.docx",
                "Pronto_TR - BASE.docx",
            }
            self.assertEqual(names, expected)
        finally:
            shutil.rmtree(zip_path.parent, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
