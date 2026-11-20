from __future__ import annotations

import sys
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TEST_ROOT))

from conformidade import avaliar_conformidade


def documentos_base():
    return {
        "DFD": {
            "OBJETO": "Aquisição de materiais",
            "TIPO_OBJ": "Aquisição",
            "JUSTIFICATIVA": "Necessidade descrita",
            "ESTIMATIVA_QUANTIDADES": "Estimativa de quantidades",
            "RESULTADOS_ESPERADOS": "Resultados esperados",
        },
        "ETP": {
            "REQUISITOS_ETP": "Documento 12 — Atestado de capacidade técnica",
            "SUBCONTRATACAO_ETP": "Subcontratação vedada",
            "ME_EPP_ETP": "Tratamento ME/EPP",
            "JUSTIFICATIVA_PAC": "Justificativa do PAC",
            "MERCADO": "Análise de mercado",
            "SOLUCAO": "Solução escolhida",
            "CRITERIOS_JUSTIFICATIVA_ETP": "Critérios motivados",
            "CRITERIOS_SUSTENTABILIDADE": "Sustentabilidade",
            "MODALIDADE_JUSTIFICATIVA_ETP": "Pregão eletrônico justificado",
            "PROVIDENCIAS_CONT": "Providências",
            "CORRELATAS_INTER": "Contratações correlatas",
            "JUSTIFICATIVA_ESTIMATIVA": "Metodologia",
            "GARANTIAS_ETP": "Garantias proporcionais",
            "VISTORIA_ETP": "Vistoria dispensada",
            "AMOSTRA_ETP": "Amostra dispensada",
            "PARCELAMENTO": "Parcelamento analisado",
            "CONCLUSAO": "Conclusão de viabilidade",
        },
        "TR": {
            "REQUISITOS_TR": "Documento 12 — Atestado de capacidade técnica",
            "OBRIGACOES_CONTRATADA": "Obrigações",
            "OBRIGACOES_CONTRANTE": "Obrigações da Administração",
            "QUALIFICACAO_TECNICA": "Qualificação proporcional",
            "GARANTIAS_TR": "Garantias",
            "EXECUCAO": "Execução",
            "PRAZO_EXEC": "Prazo",
            "LOCAL": "Local de execução",
            "AMOSTRA_TR": "Amostra dispensada",
        },
    }


class ConformidadeTests(unittest.TestCase):
    def test_documentos_com_campos_preenchidos_e_requisitos_coerentes(self):
        relatorio = avaliar_conformidade(documentos_base(), {"{{AMOST}}": "nao"})
        self.assertEqual(relatorio["summary"]["pendencias"], 0)
        self.assertEqual(next(v for v in relatorio["verificacoes"] if v["id"] == "requisitos_habilitacao")["status"], "ok")

    def test_identifica_campo_vazio_e_marcador_de_preenchimento(self):
        documentos = documentos_base()
        documentos["ETP"]["MERCADO"] = ""
        documentos["TR"]["LOCAL"] = "No endereço XXXXX"
        relatorio = avaliar_conformidade(documentos)
        self.assertTrue(any(a["tipo"] == "campo_vazio" for a in relatorio["alertas"]))
        self.assertTrue(any(a["tipo"] == "marcador_pendente" for a in relatorio["alertas"]))

    def test_identifica_documentos_adicionais_divergentes(self):
        documentos = documentos_base()
        documentos["TR"]["REQUISITOS_TR"] = "Documento 13 — Certificado"
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "requisitos_habilitacao")
        self.assertEqual(verificacao["status"], "alerta")


    def test_sinaliza_artigo_fora_do_catalogo_da_lei_14133(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 195 da Lei Federal nº 14.133/2021."
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "catalogo_artigos_lei_14133")
        self.assertEqual(verificacao["status"], "alerta")
        ocorrencia = next(a for a in relatorio["alertas"] if a["tipo"] == "artigo_fora_catalogo_lei_14133")
        self.assertEqual(ocorrencia["ocorrencias"][0]["artigo"], 195)

    def test_sinaliza_artigo_fora_do_catalogo_com_lei_com_virgula(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 195 da Lei 14,133/2021."
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "catalogo_artigos_lei_14133")
        self.assertEqual(verificacao["status"], "alerta")

    def test_artigo_dentro_do_catalogo_nao_e_marcado_como_invalido(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 18 da Lei 14.133/2021."
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "catalogo_artigos_lei_14133")
        self.assertEqual(verificacao["status"], "revisao")
        self.assertFalse(any(a["tipo"] == "artigo_fora_catalogo_lei_14133" for a in relatorio["alertas"]))

    def test_identifica_conflito_entre_tema_do_artigo_e_contexto(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 18 da Lei 14.133/2021, aplica-se a sanção administrativa."
        relatorio = avaliar_conformidade(documentos)
        ocorrencia = next(a for a in relatorio["alertas"] if a["tipo"] == "citacao_incoerente_lei_14133")
        self.assertEqual(ocorrencia["ocorrencias"][0]["tema"], "Fase preparatória e elementos do planejamento da contratação, incluindo ETP e análise de riscos")
        self.assertEqual(ocorrencia["ocorrencias"][0]["coerencia"], "incompativel")

    def test_nao_sinaliza_artigo_18_quando_contexto_trata_da_fase_preparatoria(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 18 da Lei 14.133/2021, a fase preparatória contém o estudo técnico preliminar."
        relatorio = avaliar_conformidade(documentos)
        self.assertFalse(any(a["tipo"] == "citacao_incoerente_lei_14133" for a in relatorio["alertas"]))

    def test_identifica_decretos_e_sumulas_para_conferencia(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Observar o Decreto nº 12.807/2025 e a Súmula TCU nº 177."
        relatorio = avaliar_conformidade(documentos)
        ocorrencia = next(a for a in relatorio["alertas"] if a["tipo"] == "referencias_normativas_complementares")
        referencias = {item["referencia"] for item in ocorrencia["ocorrencias"]}
        self.assertIn("Decreto nº 12.807/2025", referencias)
        self.assertIn("Súmula TCU nº 177", referencias)

    def test_fundamentos_legais_exigem_conferencia_manual(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 18 da Lei 14.133/2021."
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "fundamentos_legais")
        self.assertEqual(verificacao["status"], "revisao")
        self.assertIn("não verifica automaticamente", verificacao["detalhe"])

    def test_sinaliza_amostra_dispensa_quando_formulario_exige(self):
        documentos = documentos_base()
        documentos["TR"]["AMOSTRA_TR"] = "A amostra está dispensada."
        relatorio = avaliar_conformidade(documentos, {"{{AMOST}}": "sim"})
        self.assertTrue(any(a["tipo"] == "amostra_incoerente" for a in relatorio["alertas"]))

    def test_sinaliza_amostra_incompativel_com_formulario(self):
        documentos = documentos_base()
        documentos["TR"]["AMOSTRA_TR"] = "A amostra será obrigatória."
        relatorio = avaliar_conformidade(documentos, {"{{AMOST}}": "nao"})
        self.assertTrue(any(a["tipo"] == "amostra_incoerente" for a in relatorio["alertas"]))


    def test_matriz_legal_etp_tr_e_itens_de_risco(self):
        dados = {
            "{{VIGENCIA}}": "12 meses",
            "{{GESTOR}}": "Gestor cadastrado",
            "{{FISCAL}}": "Fiscal cadastrado",
            "{{PAGAMENTO}}": "Pagamento após aceite",
            "{{MODALIDADE}}": "Pregão eletrônico",
            "{{CRITERIOS}}": "Menor preço por item",
            "{{VALOR_ESTIMADO}}": "R$ 1.000,00",
            "{{ITENS}}": "Item 1",
            "{{DOTACAO}}": "Dotação informada",
        }
        relatorio = avaliar_conformidade(documentos_base(), dados)
        matriz = relatorio["matriz_conformidade"]
        self.assertEqual(matriz["fonte"], "https://normas.leg.br/?urn=urn:lex:br:federal:lei:2021-04-01;14133")
        self.assertEqual(sum(item["id"].startswith("etp_") for item in matriz["itens"]), 13)
        self.assertEqual(sum(item["id"].startswith("tr_") for item in matriz["itens"]), 10)
        self.assertEqual(matriz["summary"]["alertas"], 0)
        self.assertTrue(any(item["id"] == "risco_art18_x" and item["status"] == "revisao" for item in matriz["itens"]))

    def test_matriz_sinaliza_elemento_minimo_etp_ausente(self):
        documentos = documentos_base()
        documentos["ETP"]["PARCELAMENTO"] = ""
        relatorio = avaliar_conformidade(documentos, {})
        item = next(item for item in relatorio["matriz_conformidade"]["itens"] if item["id"] == "etp_viii")
        self.assertEqual(item["status"], "alerta")
        self.assertIn("PARCELAMENTO", item["detalhe"])



if __name__ == "__main__":
    unittest.main()
