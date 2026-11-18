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

    def test_fundamentos_legais_exigem_conferencia_manual(self):
        documentos = documentos_base()
        documentos["ETP"]["CONCLUSAO"] = "Nos termos do art. 18 da Lei 14.133/2021."
        relatorio = avaliar_conformidade(documentos)
        verificacao = next(v for v in relatorio["verificacoes"] if v["id"] == "fundamentos_legais")
        self.assertEqual(verificacao["status"], "revisao")
        self.assertIn("não verifica automaticamente", verificacao["detalhe"])

    def test_sinaliza_amostra_incompativel_com_formulario(self):
        documentos = documentos_base()
        documentos["TR"]["AMOSTRA_TR"] = "A amostra será obrigatória."
        relatorio = avaliar_conformidade(documentos, {"{{AMOST}}": "nao"})
        self.assertTrue(any(a["tipo"] == "amostra_incoerente" for a in relatorio["alertas"]))


if __name__ == "__main__":
    unittest.main()
