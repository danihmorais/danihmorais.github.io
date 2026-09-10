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

import fila

fila._process_one_job = lambda: None

from fastapi.testclient import TestClient
from main import app


class LicitaBackendTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(QUEUE_DIR, ignore_errors=True)

    def setUp(self):
        for path in QUEUE_DIR.glob("*"):
            if path.is_file():
                path.unlink()

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
                "{{ITENS}}": json.dumps([
                    {"numero": 1, "qtd": 1, "valor": 80000.01}
                ]),
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
            job_id = created.json()["job_id"]
            self.assertEqual(created.json()["status"], "queued")

            consulted = client.get(f"/api/fila/{job_id}")
            self.assertEqual(consulted.status_code, 200)
            self.assertEqual(consulted.json()["job_id"], job_id)
            self.assertEqual(consulted.json()["status"], "queued")
            self.assertEqual(consulted.json()["email"], payload["email"])

    def test_endpoint_rejeita_job_id_invalido(self):
        with TestClient(app) as client:
            response = client.get("/api/fila/nao-e-uuid-hexadecimal")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Solicitação não encontrada", response.json()["detail"])

    def test_gerar_zip_produz_os_tres_documentos_base(self):
        dados_usuario = {
            "{{OBJETO}}": "Aquisição de materiais de expediente",
            "{{NECESSIDADE}}": "Reposição de estoque da Administração Municipal",
            "{{ITENS}}": json.dumps([
                {
                    "numero": 1,
                    "descricao": "Caneta esferográfica azul",
                    "un": "UN",
                    "qtd": 10,
                    "valor": 2.50,
                }
            ]),
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
