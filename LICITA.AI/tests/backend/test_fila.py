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

        self.assertIn("{{A}}", modificacoes["{{A}}"])
        self.assertIn("{{A}}", modificacoes["{{B}}"])

    def test_retry_tem_backoff_exponencial_e_respeita_retry_at(self):
        self.assertEqual(fila._retry_delay_seconds(1), 5)
        self.assertEqual(fila._retry_delay_seconds(2), 10)
        self.assertEqual(fila._retry_delay_seconds(3), 20)

        futuro = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
        passado = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.assertFalse(fila._retry_is_ready({"retry_at": futuro}))
        self.assertTrue(fila._retry_is_ready({"retry_at": passado}))
        self.assertTrue(fila._retry_is_ready({}))


if __name__ == "__main__":
    unittest.main()
