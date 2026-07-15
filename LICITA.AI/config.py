import json
import os
import sys

if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
    EXECUTABLE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXECUTABLE_DIR = BASE_DIR

MODEL_OPENROUTER = "openrouter/free"
MODEL_GEMINI = "gemini-3.5-flash"

PROVEDORES_IA = {
    "openrouter": "OpenRouter",
    "gemini": "Gemini (Google)"
}

DEFAULT_PROVIDER = "gemini"

BASE_FILES = [
    "DFD - BASE.docx",
    "ETP - BASE.docx",
    "TR - BASE.docx",
]

PASTA_MODELOS = os.path.join(BASE_DIR, "modelos")

DEFAULT_OUTPUT_FOLDER_NAME = "Documentos_Gerados"

DEFAULT_SETTINGS = {
    "textos": {
        "clausula_padrao": "A prorrogação, quando aplicável, deverá respeitar os limites legais e será formalizada por meio de termo aditivo, mediante prévia manifestação técnica e jurídica, assegurando a continuidade do fornecimento e o atendimento ininterrupto das necessidades do município.\n\nPara viabilizar a prorrogação, o pedido deverá ser encaminhado ao Setor de Licitações com antecedência mínima de 60 (sessenta) dias do término da vigência contratual, conforme dispõe o art. 68 do Decreto Municipal nº 2.056/2024.",
        "meepp_exclusivo": "Nos termos do art. 47 e 48 da LCP 123/2006, que versa que a Administração Pública deverá realizar processo licitatório destinado exclusivamente à participação de microempresas e empresas de pequeno porte nos itens de contratação cujo valor seja de até R$ 80.000,00 (oitenta mil reais), e considerando ainda que este tipo de contratação é comumente realizado por empresas de pequeno porte em valores de mercado, hipótese no qual não haverá risco de oportunidade significativos, esta licitação SERÁ exclusiva para ME/EPP.",
        "meepp_nao_exclusivo": "Nos termos do art. 49, inciso III da LCP 123/2006, que versa que o tratamento diferenciado e simplificado para as microempresas e empresas de pequeno porte pode ser afastado quando não for vantajoso para a administração pública ou representar prejuízo ao conjunto ou complexo do objeto a ser contratado e, considerando ainda que já tivemos licitações com esse benefício, no qual restou comprovada a vantagem em se admitir empresas de todos os portes em busca do melhor preço, esta licitação NÃO será exclusiva para ME/EPP, sendo concedido, porém, o benefício do empate ficto e demais tratamentos diferenciados para tais empresas.",
        "amostra_tr": "Será exigida amostra do licitante vencedor provisório, conforme estipulado neste Termo de Referência.",
        "vistoria_tr": "Em vista da especificidade do objeto, o licitante ora interessado poderá realizar visita pessoalmente ao local em que ocorrerão os serviços, às suas expensas, DURANTE O PRAZO DE ENVIO DAS PROPOSTAS.\nAinda, nos termos do art. 63 §4 da Lei Federal nº 14.133/2021, a visita poderá ser acompanhada pelo Fiscal, Sr. {{FISCAL}}, cujo acompanhamento individualizado deverá ser solicitado pelo fone 17 3693-1101 até 12 (doze) horas antes do término do prazo para envio de propostas, cuja visita será realizada das 8:00 às 11:00 e das 13:00 às 16:00.\nIndependentemente da realização de visita ou não, o licitante declarará na Habilitação que conhece plenamente as condições e peculiaridades do objeto, em especial quanto às suas dimensões, locais, padrões e todos os demais aspectos relacionados ao objeto, ciente de que não poderá ser alegado equívoco no dimensionamento de sua proposta e se comprometendo em refazer, às suas expensas, os serviços que estiverem em desacordo com o solicitado pela Administração, nos termos do §3 art. 63 da Lei Federal nº 14.133/2021.\nEm virtude da oportunidade para visita, não serão aceitas alegações de erro no dimensionamento das propostas, hipótese no qual o licitante deverá executar o objeto em perfeita sintonia com o desejado pela Administração, mantendo o preço pactuado, ainda que isso signifique prejuízo financeiro."
    }
}

ALIASES = [
    ("{{ESTIMATIVA}}", "{{ESTIMATIVA_QUANTIDADES}}"),
    ("{{RESULTADOS}}", "{{RESULTADOS_ESPERADOS}}"),
    ("{{OBRIG_CONTRATADA}}", "{{OBRIGACOES_CONTRATADA}}"),
    ("{{SOLUCAO}}", "{{ESPECIFICACAO_TECNICA}}"),
    ("{{PARCELAMENTO}}", "{{CRITERIOS_JUSTIFICATIVA_ETP}}"),
    ("{{IMPAC_AMB}}", "{{CRITERIOS_SUSTENTABILIDADE}}"),
]

def deep_merge(default: dict, custom: dict) -> dict:
    result = default.copy()
    for key, value in custom.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

SETTINGS = DEFAULT_SETTINGS.copy()
TEXTOS = SETTINGS["textos"].copy()

def carregar_settings(app_data_dir: str):
    arquivo_settings = os.path.join(app_data_dir, "settings.json")
    if os.path.exists(arquivo_settings):
        try:
            with open(arquivo_settings, "r", encoding="utf-8") as file:
                custom_settings = json.load(file)
            merged = deep_merge(DEFAULT_SETTINGS, custom_settings)
            SETTINGS.clear()
            SETTINGS.update(merged)
            TEXTOS.clear()
            TEXTOS.update(SETTINGS.get("textos", {}))
        except Exception:
            pass