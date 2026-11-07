from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import fila_pipeline_unificado as pipeline
from fila_pipeline import ErroPermanente

JOB_ID = "d" * 32


class TestValidacaoDoPipelineVindoDoCliente(unittest.TestCase):
    def test_tipo_de_etapa_desconhecido_e_rejeitado(self):
        with self.assertRaisesRegex(ErroPermanente, "não permitido"):
            pipeline._validar_etapas([{"id": "X", "tipo": "executar_qualquer_coisa", "prompt": "p"}])

    def test_quantidade_excessiva_de_etapas_e_rejeitada(self):
        etapas = [{"id": f"E{i}", "tipo": "geracao_json", "prompt": "p"} for i in range(pipeline.MAX_ETAPAS + 1)]
        with self.assertRaises(ErroPermanente):
            pipeline._validar_etapas(etapas)

    def test_identificador_invalido_e_rejeitado(self):
        with self.assertRaises(ErroPermanente):
            pipeline._validar_etapas([{"id": "../etc/passwd", "tipo": "geracao_json", "prompt": "p"}])

    def test_etapas_geradas_pelo_front_sao_aceitas(self):
        pipeline._validar_etapas([
            {"id": "AUDITORIA_MARCAS", "tipo": "auditoria_marcas"},
            {"id": "PAGAMENTO_ETAPAS", "tipo": "geracao_json"},
            {"id": "CONSULTA_HABILITACAO", "tipo": "consulta_habilitacao"},
            {"id": "FASE_PREPARATORIA", "tipo": "geracao_unificada"},
            {"id": "CONTRATACAO_DIRETA", "tipo": "geracao_contratacao_direta"},
        ])

    def test_temperatura_e_limitada_e_tolera_valores_invalidos(self):
        self.assertEqual(pipeline._temperatura_valida(99, 0.3), 1.5)
        self.assertEqual(pipeline._temperatura_valida(-3, 0.3), 0.0)
        self.assertEqual(pipeline._temperatura_valida(None, 0.3), 0.3)
        self.assertEqual(pipeline._temperatura_valida("abc", 0.3), 0.3)
        self.assertEqual(pipeline._temperatura_valida(float("nan"), 0.3), 0.3)
        self.assertEqual(pipeline._temperatura_valida(0, 0.3), 0.0)


class TestChavesPermitidasDaIA(unittest.TestCase):
    CAMPOS = {c: f"texto {c}" for c in pipeline._CAMPOS_CONTRATACAO_DIRETA}

    def test_contratacao_direta_descarta_chaves_que_sobrescreveriam_dados_fixos(self):
        resposta = {**self.CAMPOS, "VALOR_ESTIMADO": "R$ 1,00", "{{ITENS}}": "adulterado", "FISCAL": "X"}
        resultado = pipeline._validar_json_contratacao_direta(resposta)
        self.assertEqual(set(resultado), set(pipeline._CAMPOS_CONTRATACAO_DIRETA))

    def test_contratacao_direta_exige_todos_os_campos(self):
        resposta = dict(self.CAMPOS)
        del resposta["CONCLUSAO_CONTRATACAO_DIRETA"]
        with self.assertRaisesRegex(RuntimeError, "CONCLUSAO_CONTRATACAO_DIRETA"):
            pipeline._validar_json_contratacao_direta(resposta)

    def test_pagamento_por_etapas_mantem_somente_o_campo_pagamento(self):
        self.assertEqual(
            pipeline._validar_json_pagamento_etapas({"PAGAMENTO": "30% na entrega", "OBJETO": "adulterado"}),
            {"PAGAMENTO": "30% na entrega"},
        )
        with self.assertRaises(RuntimeError):
            pipeline._validar_json_pagamento_etapas({"OUTRO": "x"})


class TestFerramentasEmEtapasMecanicas(unittest.TestCase):
    def test_auditoria_de_marcas_nao_usa_pesquisa_web(self):
        self.assertEqual(pipeline._opcoes_chamada_ia_etapa("auditoria_marcas"), {"enable_tools": False})

    def test_etapas_de_pesquisa_mantem_ferramentas(self):
        self.assertEqual(pipeline._opcoes_chamada_ia_etapa("consulta_habilitacao"), {})
        self.assertEqual(pipeline._opcoes_chamada_ia_etapa("geracao_contratacao_direta"), {})


class TestErroPermanenteNaoRepete(unittest.TestCase):
    def _executar(self, erro, tentativas=1):
        with tempfile.TemporaryDirectory() as diretorio:
            raiz = Path(diretorio)
            processamento = raiz / f"{JOB_ID}.processing.json"
            processamento.write_text("{}", encoding="utf-8")
            job = {"job_id": JOB_ID, "status": "processing", "attempts": tentativas,
                   "email": "a@example.com", "current_stage": "FASE_PREPARATORIA", "dados_usuario": {}}
            with (
                patch.object(pipeline, "MAX_ATTEMPTS", 3),
                patch.object(pipeline, "SMTP_FROM", "licitacao@example.gov.br"),
                patch.object(pipeline, "_claim_next_job", return_value=(processamento, job)),
                patch.object(pipeline, "_process_pipeline", side_effect=erro),
                patch.object(pipeline, "_job_path", side_effect=lambda i, suffix="": raiz / f"{i}{suffix}.json"),
                patch.object(pipeline, "_artifact_path", side_effect=lambda i: raiz / f"{i}.artifact.zip"),
                patch.object(pipeline, "_write_json"),
                patch.object(pipeline, "_enviar_email_alerta_falha") as alertar,
            ):
                pipeline._process_one_job()
        return job, alertar

    def test_erro_permanente_falha_na_primeira_tentativa_e_alerta(self):
        job, alertar = self._executar(ErroPermanente("prompt grande demais"), tentativas=1)
        self.assertEqual(job["status"], "failed")
        alertar.assert_called_once()

    def test_erro_transitorio_continua_sendo_repetido(self):
        job, alertar = self._executar(RuntimeError("IA fora do ar"), tentativas=1)
        self.assertEqual(job["status"], "queued")
        alertar.assert_not_called()

    def test_excecao_com_texto_vazio_registra_o_tipo(self):
        job, _ = self._executar(TimeoutError(), tentativas=1)
        self.assertEqual(job["last_error"], "TimeoutError")


class TestRecuperacaoDeOrfaos(unittest.TestCase):
    def _preparar(self, raiz: Path, *, tentativas: int, idade: float):
        caminho = raiz / f"{JOB_ID}.processing.json"
        job = {"job_id": JOB_ID, "status": "processing", "attempts": tentativas, "current_stage": "FASE_PREPARATORIA",
               "stage_history": [{"stage": "FASE_PREPARATORIA", "started_at": "2026-01-01T00:00:00+00:00", "status": "processing"}],
               "attempt_history": [{"attempt": tentativas, "started_at": "2026-01-01T00:00:00+00:00", "status": "processing"}]}
        caminho.write_text(json.dumps(job), encoding="utf-8")
        antigo = time.time() - idade
        os.utime(caminho, (antigo, antigo))
        return caminho

    def _recuperar(self, raiz: Path):
        with (
            patch.object(pipeline, "QUEUE_DIR", raiz),
            patch.object(pipeline, "MAX_ATTEMPTS", 3),
            patch.object(pipeline, "_job_path", side_effect=lambda i, suffix="": raiz / f"{i}{suffix}.json"),
            patch.object(pipeline, "_artifact_path", side_effect=lambda i: raiz / f"{i}.artifact.zip"),
            patch.object(pipeline, "_write_json", side_effect=lambda c, d: c.write_text(json.dumps(d), encoding="utf-8")),
        ):
            return pipeline._recuperar_orfaos()

    def test_pedido_parado_e_reenfileirado(self):
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            processamento = self._preparar(raiz, tentativas=1, idade=pipeline.STALE_PROCESSING_SECONDS + 60)
            self.assertEqual(self._recuperar(raiz), 1)
            self.assertFalse(processamento.exists())
            job = json.loads((raiz / f"{JOB_ID}.json").read_text(encoding="utf-8"))
            self.assertEqual(job["status"], "queued")
            self.assertIn("interrompido", job["last_error"])

    def test_pedido_em_execucao_recente_nao_e_tocado(self):
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            processamento = self._preparar(raiz, tentativas=1, idade=30)
            self.assertEqual(self._recuperar(raiz), 0)
            self.assertTrue(processamento.exists())
            self.assertFalse((raiz / f"{JOB_ID}.json").exists())

    def test_pedido_sem_tentativas_restantes_vira_falha(self):
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            self._preparar(raiz, tentativas=3, idade=pipeline.STALE_PROCESSING_SECONDS + 60)
            self.assertEqual(self._recuperar(raiz), 1)
            job = json.loads((raiz / f"{JOB_ID}.failed.json").read_text(encoding="utf-8"))
            self.assertEqual(job["status"], "failed")


class TestRecuperacaoDeOrfaosCancelados(unittest.TestCase):
    def test_orfao_com_cancelamento_pendente_e_cancelado_em_vez_de_reenfileirado(self):
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            caminho = raiz / f"{JOB_ID}.processing.json"
            job = {"job_id": JOB_ID, "status": "processing", "attempts": 1, "current_stage": "FASE_PREPARATORIA"}
            caminho.write_text(json.dumps(job), encoding="utf-8")
            marcador = raiz / f"{JOB_ID}.cancel"
            marcador.write_text(json.dumps({"requested_by": "usuario"}), encoding="utf-8")
            antigo = time.time() - pipeline.STALE_PROCESSING_SECONDS - 60
            os.utime(caminho, (antigo, antigo))
            with (
                patch.object(pipeline, "QUEUE_DIR", raiz),
                patch.object(pipeline, "_job_path", side_effect=lambda i, suffix="": raiz / f"{i}{suffix}.json"),
                patch.object(pipeline, "_artifact_path", side_effect=lambda i: raiz / f"{i}.artifact.zip"),
                patch.object(pipeline, "_marcador_cancelamento", return_value=marcador),
                patch.object(pipeline, "_write_json", side_effect=lambda c, d: c.write_text(json.dumps(d), encoding="utf-8")),
            ):
                self.assertEqual(pipeline._recuperar_orfaos(), 1)
            cancelado = json.loads((raiz / f"{JOB_ID}.cancelled.json").read_text(encoding="utf-8"))
            self.assertEqual(cancelado["status"], "cancelled")
            self.assertFalse(caminho.exists())
            self.assertFalse((raiz / f"{JOB_ID}.json").exists())


class TestAnaliseDoTrPersistida(unittest.TestCase):
    def test_nova_tentativa_nao_repete_a_chamada_de_ia(self):
        with tempfile.TemporaryDirectory() as diretorio:
            raiz = Path(diretorio)

            def gerar_zip(*_):
                pasta = raiz / "gerados"
                pasta.mkdir(exist_ok=True)
                arquivo = pasta / "d.zip"
                arquivo.write_bytes(b"zip")
                return arquivo, "d.zip"

            job = {
                "job_id": JOB_ID, "email": "a@example.com", "status": "processing", "attempts": 1,
                "dados_usuario": {"{{ITENS}}": json.dumps([{"numero": 1, "qtd": 1, "valor": 10}])},
                "dados_ia": {"__LICITA_PIPELINE__": {
                    "documentos_anteriores": [{"tipo": "TR", "nome": "TR", "texto": "texto sem tabela nem total"}],
                    "etapas": [{"id": "ETAPA_1", "tipo": "geracao_json", "prompt": "P"}],
                }},
            }
            with (
                patch.object(pipeline, "_job_path", side_effect=lambda i, suffix="": raiz / f"{i}{suffix}.json"),
                patch.object(pipeline, "_artifact_path", side_effect=lambda i: raiz / f"{i}.artifact.zip"),
                patch.object(pipeline, "_write_json"),
                patch.object(pipeline, "_chamar_ia", return_value=({"CAMPO": "x"}, "m")),
                patch.object(pipeline, "gerar_zip", side_effect=gerar_zip),
                patch.object(pipeline, "_total_itens_tr_por_ia", return_value=(Decimal("1000.00"), "m")) as analisar,
                patch.object(pipeline, "_enviar_email", side_effect=[RuntimeError("SMTP caiu"), None]),
            ):
                with self.assertRaisesRegex(RuntimeError, "SMTP caiu"):
                    pipeline._process_pipeline(job)
                self.assertEqual(job["total_anterior_ia"], "1000.00")
                pipeline._process_pipeline(job)

            analisar.assert_called_once()
            self.assertEqual(job["status"], "sent")
            self.assertEqual(job["dados_ia"]["VALOR_ESTIMADO_APROXIMADO"], "R$ 1.050,00")


if __name__ == "__main__":
    unittest.main()
