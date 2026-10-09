from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

import fila


class FilaTests(unittest.TestCase):
    def test_resolve_placeholders_suporta_cadeias_maiores_que_tres_niveis(self):
        modificacoes = {
            "{{A}}": "{{B}}",
            "{{B}}": "{{C}}",
            "{{C}}": "{{D}}",
            "{{D}}": "{{E}}",
            "{{E}}": "valor final",
        }

        fila._resolver_placeholders(modificacoes)

        self.assertEqual(modificacoes["{{A}}"], "valor final")
        self.assertEqual(modificacoes["{{B}}"], "valor final")

    def test_resolve_placeholders_preserva_ciclos_sem_loop_infinito(self):
        modificacoes = {
            "{{A}}": "{{B}}",
            "{{B}}": "{{A}}",
        }

        fila._resolver_placeholders(modificacoes)

        self.assertIn("{{", modificacoes["{{A}}"])
        self.assertIn("{{", modificacoes["{{B}}"])

    def test_retry_tem_backoff_exponencial_e_respeita_retry_at(self):
        self.assertEqual(fila._retry_delay_seconds(1), 5)
        self.assertEqual(fila._retry_delay_seconds(2), 10)
        self.assertEqual(fila._retry_delay_seconds(3), 20)

        futuro = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
        passado = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.assertFalse(fila._retry_is_ready({"retry_at": futuro}))
        self.assertTrue(fila._retry_is_ready({"retry_at": passado}))
        self.assertTrue(fila._retry_is_ready({}))


    def test_alerta_de_falha_identifica_envio_e_destinatario(self):
        from unittest.mock import MagicMock, patch

        cliente = MagicMock()
        cliente.__enter__.return_value = cliente
        job = {
            "job_id": "a" * 32,
            "attempts": 3,
            "email": "destinatario@example.com",
            "current_stage": "ENVIO_EMAIL",
            "dados_usuario": {"{{OBJETO}}": "Aquisição de materiais"},
        }

        with (
            patch.object(fila, "ALERT_EMAIL", "licitacao@example.gov.br"),
            patch.object(fila, "SMTP_USERNAME", "smtp@example.gov.br"),
            patch.object(fila, "SMTP_PASSWORD", "senha-de-teste"),
            patch.object(fila, "_smtp_client", return_value=cliente),
        ):
            fila._enviar_email_alerta_falha(job, "Falha SMTP simulada")

        mensagem = cliente.send_message.call_args.args[0]
        self.assertEqual(mensagem["To"], "licitacao@example.gov.br")
        self.assertIn("LICITA.AI", mensagem["Subject"])
        texto = mensagem.get_content()
        self.assertIn("envio do e-mail ao destinatário", texto)
        self.assertIn("destinatario@example.com", texto)
        self.assertIn("Falha SMTP simulada", texto)
        cliente.login.assert_called_once_with("smtp@example.gov.br", "senha-de-teste")

    def test_alerta_de_falha_identifica_erro_de_geracao(self):
        from unittest.mock import MagicMock, patch

        cliente = MagicMock()
        cliente.__enter__.return_value = cliente
        job = {
            "job_id": "b" * 32,
            "attempts": 3,
            "email": "destinatario@example.com",
            "current_stage": "FASE_PREPARATORIA",
            "dados_usuario": {},
        }

        with (
            patch.object(fila, "ALERT_EMAIL", "licitacao@example.gov.br"),
            patch.object(fila, "_smtp_client", return_value=cliente),
        ):
            fila._enviar_email_alerta_falha(job, "Erro ao gerar DOCX")

        texto = cliente.send_message.call_args.args[0].get_content()
        self.assertIn("geração/processamento dos documentos", texto)
        self.assertIn("Erro ao gerar DOCX", texto)



if __name__ == "__main__":
    unittest.main()
