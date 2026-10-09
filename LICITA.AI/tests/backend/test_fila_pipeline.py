import json
import unittest

from fila_pipeline import _aplicar_auditoria_marcas, _extrair_json, _substituir_contextos, _validar_json_geracao
from fila_pipeline_unificado import _adicionar_documentos_de_referencia


class TestFilaPipeline(unittest.TestCase):
    def test_documentos_de_referencia_entram_no_prompt_com_prioridade(self):
        prompt = _adicionar_documentos_de_referencia(
            "PROMPT BASE",
            [
                {
                    "tipo": "DFD",
                    "origem": "documento_anterior",
                    "nome": "DFD anterior.docx",
                    "texto": "Objeto anterior e justificativa relevante.",
                },
                {
                    "tipo": "TR",
                    "origem": "anexo_do_edital",
                    "nome": "Edital — ANEXO III - TERMO DE REFERÊNCIA",
                    "texto": "Condição operacional do TR anterior.",
                },
            ],
        )
        self.assertIn("DOCUMENTOS DE REFERÊNCIA PRIORITÁRIA", prompt)
        self.assertIn("principal referência factual e estrutural", prompt)
        self.assertIn("Objeto anterior e justificativa relevante.", prompt)
        self.assertIn("Condição operacional do TR anterior.", prompt)
        self.assertIn("dados atuais do usuário e as instruções atuais prevalecem", prompt)


    def test_substitui_contextos(self):
        texto = "DFD={{DFD}} ET={{ETP}} DADOS={{DADOS}} STAGES={{STAGES}}"
        resultado = _substituir_contextos(
            texto.replace("{{DFD}}", "__LICITA_PIPE_DFD__")
            .replace("{{ETP}}", "__LICITA_PIPE_ETP__")
            .replace("{{DADOS}}", "__LICITA_PIPE_DADOS_USUARIO__")
            .replace("{{STAGES}}", "__LICITA_PIPE_ETAPAS__"),
            {"{{OBJETO}}": "Aquisição de bens"},
            {"DFD": {"OBJETO": "Aquisição"}, "ETP": {"MERCADO": "Análise"}},
        )
        self.assertIn('"OBJETO": "Aquisição"', resultado)
        self.assertIn('"MERCADO": "Análise"', resultado)
        self.assertIn('"{{OBJETO}}": "Aquisição de bens"', resultado)

    def test_extrair_json(self):
        resultado = _extrair_json('texto antes {"ok": "sim",} texto depois')
        self.assertEqual(resultado, {"ok": "sim"})

    def test_valida_json(self):
        self.assertEqual(_validar_json_geracao({"A": "texto"}), {"A": "texto"})
        with self.assertRaises(RuntimeError):
            _validar_json_geracao({"A": ""})

    def test_auditoria_apenas_remove_marca(self):
        dados = {"{{ITENS}}": json.dumps([{"numero": 1, "descricao": "Pneu Michelin aro 15"}])}
        resposta = {"itens": [{"numero": 1, "nome_revisado": "Pneu aro 15", "motivo": "Marca identificada"}]}
        novos_dados, auditoria = _aplicar_auditoria_marcas(dados, resposta)
        itens = json.loads(novos_dados["{{ITENS}}"])
        self.assertEqual(itens[0]["descricao"], "Pneu aro 15")
        self.assertTrue(auditoria["itens"][0]["alterado"])


if __name__ == "__main__":
    unittest.main()


class TestPagamentoPipeline(unittest.TestCase):
    def test_pagamento_por_etapas_nao_pode_ser_sobrescrito_por_fase_preparatoria(self):
        resultados = {
            "PAGAMENTO_ETAPAS": {"PAGAMENTO": "Pagamento revisado por etapas."},
            "FASE_PREPARATORIA": {
                "DFD": {},
                "ETP": {},
                "TR": {},
                "PAGAMENTO": "Pagamento inventado pela IA principal.",
            },
        }
        dados_ia_final = {}
        for etapa_id, resultado in resultados.items():
            if etapa_id == "AUDITORIA_MARCAS" or not isinstance(resultado, dict):
                continue
            blocos = (
                resultado
                if etapa_id == "FASE_PREPARATORIA"
                and all(isinstance(resultado.get(bloco), dict) for bloco in ("DFD", "ETP", "TR"))
                else {"_": resultado}
            )
            for bloco in blocos.values():
                if not isinstance(bloco, dict):
                    continue
                for chave, valor in bloco.items():
                    if chave == "PAGAMENTO" and etapa_id != "PAGAMENTO_ETAPAS":
                        continue
                    dados_ia_final[chave] = valor

        self.assertEqual(dados_ia_final["PAGAMENTO"], "Pagamento revisado por etapas.")


class TestPipelineUnificado(unittest.TestCase):
    def test_reutiliza_modelo_resolvido_nas_etapas_seguintes(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        import fila_pipeline_unificado as pipeline

        chamadas_modelo = []
        job_id = "a" * 32

        def chamar_ia(prompt, model, temperature=0.3):
            chamadas_modelo.append(model)
            return {"CAMPO": f"resultado de {prompt}"}, "modelo-resolvido"

        with tempfile.TemporaryDirectory() as diretorio:
            raiz = Path(diretorio)

            def caminho_job(_job_id, suffix=""):
                return raiz / f"{_job_id}{suffix}.json"

            def caminho_artifact(_job_id):
                return raiz / f"{_job_id}.artifact.zip"

            def gerar_zip(_dados_usuario, _dados_ia, _session_id):
                pasta_gerada = raiz / "gerados"
                pasta_gerada.mkdir()
                arquivo = pasta_gerada / "documentos.zip"
                arquivo.write_bytes(b"zip de teste")
                return arquivo, "documentos.zip"

            job = {
                "job_id": job_id,
                "email": "teste@example.com",
                "status": "processing",
                "attempts": 1,
                "dados_usuario": {"{{OBJETO}}": "Objeto de teste"},
                "dados_ia": {
                    "__LICITA_PIPELINE__": {
                        "model": "unsloth-auto",
                        "temperature": 0.3,
                        "etapas": [
                            {"id": "ETAPA_1", "tipo": "geracao_json", "prompt": "PROMPT_1"},
                            {"id": "ETAPA_2", "tipo": "geracao_json", "prompt": "PROMPT_2"},
                        ],
                    }
                },
            }

            with (
                patch.object(pipeline, "_job_path", side_effect=caminho_job),
                patch.object(pipeline, "_artifact_path", side_effect=caminho_artifact),
                patch.object(pipeline, "_write_json"),
                patch.object(pipeline, "_chamar_ia", side_effect=chamar_ia),
                patch.object(pipeline, "gerar_zip", side_effect=gerar_zip),
                patch.object(pipeline, "_enviar_email") as enviar_email,
            ):
                pipeline._process_pipeline(job)

        self.assertEqual(chamadas_modelo, ["unsloth-auto", "modelo-resolvido"])
        self.assertEqual(job["status"], "sent")
        enviar_email.assert_called_once()
