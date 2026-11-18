import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import fila


class TestIndiceSQLiteFila(unittest.TestCase):
    def test_write_json_atualiza_indice_wal_e_consulta_por_id(self):
        job_id = "f" * 32
        with tempfile.TemporaryDirectory() as diretorio:
            base = Path(diretorio)

            def caminho(identificador, extensao):
                return base / f"{identificador}{extensao}.json"

            with patch.object(fila, "_job_path", side_effect=caminho):
                fila._SQLITE_FILA_INICIALIZADO = False
                job = {
                    "job_id": job_id,
                    "status": "queued",
                    "created_at": "2026-11-17T12:00:00+00:00",
                    "updated_at": "2026-11-17T12:00:00+00:00",
                    "email": "licitacao@example.gov.br",
                }
                destino = caminho(job_id, ".queued")
                fila._write_json(destino, job)
                encontrado = fila.get_job(job_id)
                listagem = fila.listar_jobs_sqlite("queued")
                db = base / "queue.sqlite3"

            self.assertTrue(db.is_file())
            self.assertEqual(encontrado["job_id"], job_id)
            self.assertEqual(encontrado["email"], job["email"])
            self.assertEqual([item["job_id"] for item in listagem], [job_id])

    def test_indice_usa_status_e_indice_composto(self):
        with tempfile.TemporaryDirectory() as diretorio:
            base = Path(diretorio)
            with patch.object(fila, "_job_path", side_effect=lambda identificador, extensao: base / f"{identificador}{extensao}.json"):
                fila._SQLITE_FILA_INICIALIZADO = False
                conexao = fila._sqlite_fila_conectar()
                try:
                    nomes = {linha["name"] for linha in conexao.execute("PRAGMA index_list(queue_jobs)")}
                    journal = conexao.execute("PRAGMA journal_mode").fetchone()[0]
                finally:
                    conexao.close()
        self.assertIn("idx_queue_jobs_status_created", nomes)
        self.assertEqual(str(journal).lower(), "wal")


if __name__ == "__main__":
    unittest.main()
