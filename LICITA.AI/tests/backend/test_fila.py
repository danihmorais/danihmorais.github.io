from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

import fila


class FilaTests(unittest.TestCase):
    def test_gerar_zip_corrige_escapes_de_quebra_nos_campos_ia(self):
        import shutil
        import tempfile
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as diretorio_modelos:
            modelo = Path(diretorio_modelos) / "modelo.docx"
            modelo.write_bytes(b"modelo de teste")
            modificacoes_capturadas = {}

            def modificar_falso(_origem, destino, modificacoes):
                modificacoes_capturadas.update(modificacoes)
                Path(destino).write_bytes(b"documento de teste")

            with (
                patch.object(fila.config, "PASTA_MODELOS", diretorio_modelos),
                patch.object(fila.config, "BASE_FILES", ["modelo.docx"]),
                patch.object(fila, "modificar_documento", side_effect=modificar_falso),
            ):
                caminho_zip, _ = fila.gerar_zip(
                    {},
                    {"CAMPO": "Primeiro parágrafo.\\nSegundo parágrafo.\\r\\nTerceiro parágrafo."},
                    "teste123",
                )
                try:
                    self.assertEqual(
                        modificacoes_capturadas["{{CAMPO}}"],
                        "Primeiro parágrafo.\nSegundo parágrafo.\nTerceiro parágrafo.",
                    )
                finally:
                    shutil.rmtree(caminho_zip.parent, ignore_errors=True)

    def _modificacoes_de_gerar_zip(self, dados_usuario, dados_ia):
        import shutil
        import tempfile
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as diretorio_modelos:
            modelo = Path(diretorio_modelos) / "modelo.docx"
            modelo.write_bytes(b"modelo de teste")
            capturadas = {}

            def modificar_falso(_origem, destino, modificacoes):
                capturadas.update(modificacoes)
                Path(destino).write_bytes(b"documento de teste")

            with (
                patch.object(fila.config, "PASTA_MODELOS", diretorio_modelos),
                patch.object(fila.config, "BASE_FILES", ["modelo.docx"]),
                patch.object(fila, "modificar_documento", side_effect=modificar_falso),
            ):
                caminho_zip, _ = fila.gerar_zip(dados_usuario, dados_ia, "teste123")
                shutil.rmtree(caminho_zip.parent, ignore_errors=True)
        return capturadas

    def test_gerar_zip_aplica_regras_de_tabela_e_valor_arredondado_no_etp(self):
        import json
        import shutil
        import tempfile
        from unittest.mock import patch

        dados_usuario = {
            "{{ITENS}}": json.dumps([{
                "numero": 1,
                "descricao": "Papel A4",
                "un": "RESMA",
                "qtd": 10,
                "valor": 123.45,
            }], ensure_ascii=False),
        }
        dados_ia = {"VALOR_ESTIMADO_APROXIMADO": "R$ 1.300,00"}
        nomes_modelos = ["DFD - BASE.docx", "ETP - BASE.docx", "TR - BASE.docx"]
        modificacoes_por_documento = {}

        with tempfile.TemporaryDirectory() as diretorio_modelos:
            for nome in nomes_modelos:
                (Path(diretorio_modelos) / nome).write_bytes(b"modelo de teste")

            def modificar_falso(_origem, destino, modificacoes):
                nome = Path(destino).name.removeprefix("Pronto_")
                modificacoes_por_documento[nome] = dict(modificacoes)
                Path(destino).write_bytes(b"documento de teste")

            with (
                patch.object(fila.config, "PASTA_MODELOS", diretorio_modelos),
                patch.object(fila.config, "BASE_FILES", nomes_modelos),
                patch.object(fila, "modificar_documento", side_effect=modificar_falso),
            ):
                caminho_zip, _ = fila.gerar_zip(dados_usuario, dados_ia, "teste123")
                try:
                    dfd = modificacoes_por_documento["DFD - BASE.docx"]
                    etp = modificacoes_por_documento["ETP - BASE.docx"]
                    tr = modificacoes_por_documento["TR - BASE.docx"]

                    marcador = "__TABLE_CENTER_JUSTIFY__"
                    self.assertTrue(dfd["{{ITENS}}"].startswith(marcador))
                    dados_dfd = json.loads(dfd["{{ITENS}}"][len(marcador):])
                    self.assertIn("Vlr Unit.", dados_dfd[0])
                    self.assertIn("Total", dados_dfd[0])

                    self.assertTrue(etp["{{ITENS}}"].startswith(marcador))
                    dados_etp = json.loads(etp["{{ITENS}}"][len(marcador):])
                    self.assertEqual(list(dados_etp[0]), ["Item", "Descrição", "UN", "Qtd"])
                    self.assertEqual(etp["{{VALOR_ESTIMADO}}"], "R$ 1.300,00")
                    self.assertEqual(etp["{{VALOR_ESTIMADO_APROXIMADO}}"], "R$ 1.300,00")

                    self.assertTrue(tr["{{ITENS}}"].startswith("__TABLE__"))
                    dados_tr = json.loads(tr["{{ITENS}}"].replace("__TABLE__", "", 1))
                    self.assertIn("Vlr Unit.", dados_tr[0])
                    self.assertIn("Total", dados_tr[0])
                finally:
                    shutil.rmtree(caminho_zip.parent, ignore_errors=True)

    def test_gerar_zip_sem_amostra_mantem_texto_fixo_mesmo_se_a_ia_devolver_amostra_tr(self):
        modificacoes = self._modificacoes_de_gerar_zip(
            {"{{AMOST}}": "nao"},
            {"AMOSTRA_TR": "Texto inventado pela IA sobre amostras."},
        )

        self.assertEqual(
            modificacoes["{{AMOSTRA_TR}}"],
            "Não há exigência de amostra para esta contratação.",
        )

    def test_gerar_zip_com_amostra_usa_a_redacao_detalhada_da_ia(self):
        modificacoes = self._modificacoes_de_gerar_zip(
            {"{{AMOST}}": "sim"},
            {"AMOSTRA_TR": "Os licitantes deverão entregar amostras em até 7 dias úteis."},
        )

        self.assertEqual(
            modificacoes["{{AMOSTRA_TR}}"],
            "Os licitantes deverão entregar amostras em até 7 dias úteis.",
        )

    def test_remove_barras_soltas_no_fim_dos_paragrafos_sem_alterar_barras_legitimas(self):
        texto = (
            "Primeiro parágrafo. /\n"
            "Segundo parágrafo/\n"
            "Uso de e/ou e referência 14/2026.\n"
            "https://exemplo.gov.br/\n"
        )

        self.assertEqual(
            fila._normalizar_texto_gerado(texto),
            "Primeiro parágrafo.\n"
            "Segundo parágrafo\n"
            "Uso de e/ou e referência 14/2026.\n"
            "https://exemplo.gov.br/\n",
        )

    def test_remove_barra_invertida_solta_no_fim_dos_paragrafos(self):
        texto = (
            "Primeiro parágrafo.\\\n"
            "Segundo parágrafo. \\ \n"
            "Terceiro parágrafo.\\/\n"
            "Caminho C:\\Pasta\\arquivo.docx e Lei 14.133/2021.\\"
        )

        self.assertEqual(
            fila._normalizar_texto_gerado(texto),
            "Primeiro parágrafo.\n"
            "Segundo parágrafo.\n"
            "Terceiro parágrafo.\n"
            "Caminho C:\\Pasta\\arquivo.docx e Lei 14.133/2021.",
        )

    def test_url_terminada_em_barra_continua_preservada_com_barra_invertida_junto(self):
        self.assertEqual(
            fila._normalizar_texto_gerado("Veja https://exemplo.gov.br/\n"),
            "Veja https://exemplo.gov.br/\n",
        )

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
            patch.object(fila, "SMTP_FROM", "licitacao@example.gov.br"),
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
            patch.object(fila, "SMTP_FROM", "licitacao@example.gov.br"),
            patch.object(fila, "_smtp_client", return_value=cliente),
        ):
            fila._enviar_email_alerta_falha(job, "Erro ao gerar DOCX")

        texto = cliente.send_message.call_args.args[0].get_content()
        self.assertIn("geração/processamento dos documentos", texto)
        self.assertIn("Erro ao gerar DOCX", texto)



if __name__ == "__main__":
    unittest.main()
