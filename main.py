import os
import json
import sys
import io
from processador_docx import preencher_documento
from montador_variaveis import montar_variaveis_fixas

if sys.platform == "win32":
    if sys.stdout is not None:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    if sys.stderr is not None:
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    if sys.stdin is not None:
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

MODELOS_DISPONIVEIS = {
    "dispensa": "modelos/Dispensa xx Proc xx -  MINUTA DP 15.04.2026.docx",
    "dispensa_bll": "modelos/Dispensa xx Proc xx -  MINUTA DE 15.04.2026.docx",
    "pregao_eletronico": "modelos/Pregão xx Proc xx -  MINUTA PE 15.04.2026.docx",
    "pregao_presencial": "modelos/Pregão xx Proc xx -  MINUTA PP 15.04.2026.docx"
}

MOD_ABR_MAP = {
    "PREGAO_PRESENCIAL": "PP",
    "PREGAO_ELETRONICO": "PE",
    "DISPENSA_BLL": "DE",
    "DISPENSA": "DP"
}

MODALIDADE_TEXTO = {
    "PREGAO_ELETRONICO": "Pregão Eletrônico",
    "DISPENSA": "Dispensa",
    "DISPENSA_BLL": "Dispensa Eletrônica BLL",
    "PREGAO_PRESENCIAL": "Pregão Presencial"
}

def gerar_edital(tipo_edital: str, dados_preenchimento: dict):
    base_dir = os.getcwd()
    caminho_modelo = os.path.join(base_dir, MODELOS_DISPONIVEIS.get(tipo_edital, ""))

    if not tipo_edital in MODELOS_DISPONIVEIS or not os.path.exists(caminho_modelo):
        return {"sucesso": False, "erro": f"Modelo não encontrado para o tipo: {tipo_edital}\nCaminho buscado: {caminho_modelo}"}

    diretorio_saida = os.path.join(base_dir, "editais_gerados")
    os.makedirs(diretorio_saida, exist_ok=True)
    
    dados_processados = montar_variaveis_fixas(dados_preenchimento)
    
    modalidade_raw = dados_processados.get("{{MODALIDADE}}", "PREGAO_ELETRONICO")
    mod_abr = MOD_ABR_MAP.get(modalidade_raw, "PE")
    modalidade_nome = MODALIDADE_TEXTO.get(modalidade_raw, "Pregão Eletrônico")
    
    num_mod_raw = str(dados_processados.get("{{N.MODALIDADE}}", "00"))
    num_proc_raw = str(dados_processados.get("{{N.PROCESSO}}", "00"))
    
    num_mod_arq = num_mod_raw.replace("/", "-").replace("\\", "-")
    num_proc_arq = num_proc_raw.replace("/", "-").replace("\\", "-")
    
    dados_edital = dados_processados.copy()
    dados_edital["{{MINUTA DE}}"] = ""
    nome_arq_edital = f"{modalidade_nome} {num_mod_arq} Proc {num_proc_arq} - {mod_abr} 15.04.2026.docx"
    caminho_edital = os.path.join(diretorio_saida, nome_arq_edital)
    preencher_documento(caminho_modelo, caminho_edital, dados_edital)
    
    dados_minuta = dados_processados.copy()
    dados_minuta["{{N.MODALIDADE}}"] = "XX"
    dados_minuta["{{MINUTA DE}}"] = "MINUTA DE "
    dados_minuta["{{DATA DA SESSAO}}"] = "XX/XX/XXXX"
    dados_minuta["{{DATA REC PROP1}}"] = "XX/XX/XXXX"
    dados_minuta["{{DATA DA SESSAO2}}"] = "XX/XX/XXXX"
    dados_minuta["{{DATA DO EDITAL}}"] = "XX de XXXXXXXX de XXXX"
    dados_minuta["{{HORA SESSAO}}"] = "XXhXXmin"
    dados_minuta["{{HORA_SESSAO}}"] = "XXhXXmin"
    dados_minuta["{{HORA INICIO DO REC}}"] = "XXhXXmin"
    dados_minuta["{{HORA FIM DO REC}}"] = "XXhXXmin"
    dados_minuta["{{HORA INICIO CRED}}"] = "XXhXXmin"
    nome_arq_minuta = f"{modalidade_nome} XX Proc {num_proc_arq} - MINUTA DE {mod_abr} 15.04.2026.docx"
    caminho_minuta = os.path.join(diretorio_saida, nome_arq_minuta)
    preencher_documento(caminho_modelo, caminho_minuta, dados_minuta)

    return {
        "sucesso": True, 
        "caminhos": [caminho_edital, caminho_minuta],
        "caminho_arquivo": caminho_edital,
        "diretorio_saida": diretorio_saida
    }

def processar():
    try:
        if len(sys.argv) > 1:
            conteudo = sys.argv[1]
        else:
            conteudo = sys.stdin.read()
            
        if not conteudo.strip():
            print(json.dumps({"sucesso": False, "erro": "Nenhum dado recebido via Stdin."}), flush=True)
            return
            
        requisicao = json.loads(conteudo)
        
        tipo_edital = requisicao.get("tipo_edital")
        dados_preenchimento = requisicao.get("dados_preenchimento", {})
        
        resultado = gerar_edital(tipo_edital, dados_preenchimento)
        print(json.dumps(resultado), flush=True)
        
    except Exception as e:
        print(json.dumps({"sucesso": False, "erro": str(e)}), flush=True)

if __name__ == "__main__":
    processar()