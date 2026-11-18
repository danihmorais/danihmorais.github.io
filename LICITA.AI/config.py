import os
import sys

import json as _json_config_municipal
import os as _os_config_municipal
from pathlib import Path as _Path_config_municipal


def carregar_configuracao_municipal(municipio_id: str | None = None) -> dict:
    caminho = _Path_config_municipal(__file__).resolve().parent / "config" / "municipios.json"
    try:
        dados = _json_config_municipal.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        dados = {}
    identificador = municipio_id or _os_config_municipal.getenv("LICITA_MUNICIPIO_ID") or dados.get("municipio_padrao")
    municipios = dados.get("municipios") if isinstance(dados.get("municipios"), dict) else {}
    municipio = municipios.get(identificador) if isinstance(identificador, str) else None
    if not isinstance(municipio, dict):
        raise RuntimeError(f"Configuração municipal não encontrada: {identificador!r}.")
    return municipio


_MUNICIPIO_ATIVO = carregar_configuracao_municipal()
try:
    _CAMINHO_CONFIG_MUNICIPIOS = _Path_config_municipal(__file__).resolve().parent / "config" / "municipios.json"
    _CONFIG_MUNICIPIOS = _json_config_municipal.loads(_CAMINHO_CONFIG_MUNICIPIOS.read_text(encoding="utf-8"))
except (OSError, ValueError):
    _CONFIG_MUNICIPIOS = {}
_PARAMETROS_LICITACAO = _CONFIG_MUNICIPIOS.get("parametros", {}) if isinstance(_CONFIG_MUNICIPIOS, dict) else {}
_PARAMETROS_MUNICIPAIS = _MUNICIPIO_ATIVO.get("parametros", {}) if isinstance(_MUNICIPIO_ATIVO.get("parametros"), dict) else {}
LIMITE_EXCLUSIVIDADE_ME_EPP_CENTAVOS = int(_PARAMETROS_MUNICIPAIS.get("limite_exclusividade_me_epp_centavos", _PARAMETROS_LICITACAO.get("limite_exclusividade_me_epp_centavos", 8000000)))
MUNICIPIO_ID = str(_MUNICIPIO_ATIVO.get("id") or "")
MUNICIPIO_NOME = str(_MUNICIPIO_ATIVO.get("nome") or "")
MUNICIPIO_UF = str(_MUNICIPIO_ATIVO.get("uf") or "")
MUNICIPIO_DISPLAY = f"{MUNICIPIO_NOME}/{MUNICIPIO_UF}" if MUNICIPIO_UF else MUNICIPIO_NOME
DECRETO_MUNICIPAL = str(_MUNICIPIO_ATIVO.get("decreto") or "")
CAMPOS_MUNICIPAIS = _MUNICIPIO_ATIVO.get("campos", {}) if isinstance(_MUNICIPIO_ATIVO.get("campos"), dict) else {}
MODELOS_MUNICIPAIS = _MUNICIPIO_ATIVO.get("modelos", {}) if isinstance(_MUNICIPIO_ATIVO.get("modelos"), dict) else {}


def _substituir_campos_municipais(texto: str) -> str:
    limite = f"R$ {LIMITE_EXCLUSIVIDADE_ME_EPP_CENTAVOS / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    campos = {
        "{{MUNICIPIO}}": MUNICIPIO_NOME,
        "{{MUNICIPIO_UF}}": MUNICIPIO_DISPLAY,
        "{{PREFEITURA}}": str(CAMPOS_MUNICIPAIS.get("nome_completo") or f"Prefeitura Municipal de {MUNICIPIO_NOME}"),
        "{{ENDERECO_PREFEITURA}}": str(CAMPOS_MUNICIPAIS.get("endereco_prefeitura") or ""),
        "{{TELEFONE}}": str(CAMPOS_MUNICIPAIS.get("telefone") or ""),
        "{{EMAIL_LICITACAO}}": str(CAMPOS_MUNICIPAIS.get("email_licitacao") or ""),
        "{{DECRETO}}": DECRETO_MUNICIPAL,
        "{{LIMITE_ME_EPP}}": limite,
    }
    resultado = str(texto)
    for marcador, valor in campos.items():
        resultado = resultado.replace(marcador, valor)
    return resultado


if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BASE_FILES = list(MODELOS_MUNICIPAIS.get("fase_preparatoria") or [
    "DFD - BASE.docx",
    "ETP - BASE.docx",
    "TR - BASE.docx",
])

BASE_FILES_CONTRATACAO_DIRETA = list(MODELOS_MUNICIPAIS.get("contratacao_direta") or [
    "Contratação Direta - BASE.docx",
])

PASTA_MODELOS = os.path.join(BASE_DIR, str(MODELOS_MUNICIPAIS.get("pasta") or "modelos"))

# Campos do modelo de Contratação Direta preenchidos manualmente depois da geração.
# Não geram aviso de "placeholder sem valor" no log.
PLACEHOLDERS_PREENCHIMENTO_MANUAL = {
    "{{AUTORIZACAO}}", "{{CARGO_RESPONSAVEL}}", "{{CNPJ_FORNECEDOR}}", "{{DATA_AUTORIZACAO}}",
    "{{FORNECEDOR}}", "{{NUM_PROCESSO}}", "{{PROPOSTA_FORNECEDOR}}", "{{RESPONSAVEL_AUTORIZACAO}}",
    "{{VALOR_CONTRATADO}}",
}

DEFAULT_SETTINGS = {
    "textos": {
        "clausula_padrao": "A prorrogação, quando aplicável, deverá respeitar os limites legais e será formalizada por meio de termo aditivo, mediante prévia manifestação técnica e jurídica, assegurando a continuidade do atendimento às necessidades de {{MUNICIPIO}}. Para viabilizar a prorrogação, o pedido deverá ser encaminhado ao Setor de Licitações com antecedência mínima de 60 (sessenta) dias do término da vigência contratual, conforme dispõe {{DECRETO}}.",
        "clausula_ata": "A vigência da Ata de Registro de Preços poderá ser prorrogada por igual período, desde que comprovado que o preço registrado permanece vantajoso para a Administração, nos termos do art. 84 da Lei Federal nº 14.133/2021, mediante formalização do instrumento próprio antes do término da vigência original.",
        "meepp_exclusivo": "Nos termos dos arts. 47 e 48 da Lei Complementar nº 123/2006, a Administração deverá realizar processo licitatório destinado exclusivamente à participação de microempresas e empresas de pequeno porte nos itens de contratação cujo valor seja de até {{LIMITE_ME_EPP}}, observadas as hipóteses legais de afastamento e a vantajosidade para a Administração.",
        "meepp_nao_exclusivo": "Nos termos da Lei Complementar nº 123/2006, o tratamento diferenciado e simplificado para microempresas e empresas de pequeno porte poderá ser afastado nas hipóteses legais, especialmente quando não for vantajoso para a Administração ou representar prejuízo ao conjunto ou complexo do objeto. Nesta licitação, não haverá exclusividade para ME/EPP, sem prejuízo dos demais benefícios legalmente aplicáveis.",
        "amostra_tr": "Será exigida amostra do licitante vencedor provisório, conforme estipulado neste Termo de Referência.",
        "vistoria_tr": "Em vista das especificidades do objeto, o licitante poderá realizar visita ao local de execução, às suas expensas, durante o prazo de envio das propostas. A visita, quando solicitada, poderá ser acompanhada pelo Fiscal {{FISCAL}}, cujo acompanhamento individualizado deverá ser solicitado pelo telefone {{TELEFONE}}. O local de visita será {{ENDERECO_PREFEITURA}}, em dias úteis e horários previamente informados pela Administração. Independentemente da visita, o licitante declarará na habilitação que conhece as condições e peculiaridades do objeto, observados os requisitos legais aplicáveis."
    }
}

ALIASES = [
    ("{{ESTIMATIVA}}", "{{ESTIMATIVA_QUANTIDADES}}"),
    ("{{RESULTADOS}}", "{{RESULTADOS_ESPERADOS}}"),
    ("{{OBRIG_CONTRATADA}}", "{{OBRIGACOES_CONTRATADA}}"),
    ("{{IMPAC_AMB}}", "{{CRITERIOS_SUSTENTABILIDADE}}"),
]

_TEXTOS_MUNICIPAIS = _MUNICIPIO_ATIVO.get("textos", {}) if isinstance(_MUNICIPIO_ATIVO.get("textos"), dict) else {}
TEXTOS = {
    chave: _substituir_campos_municipais(valor)
    for chave, valor in {**DEFAULT_SETTINGS["textos"], **_TEXTOS_MUNICIPAIS}.items()
    if isinstance(valor, str)
}
SETTINGS = {"textos": TEXTOS.copy()}
LIMITE_ME_EPP_TEXTO = _substituir_campos_municipais("{{LIMITE_ME_EPP}}")
