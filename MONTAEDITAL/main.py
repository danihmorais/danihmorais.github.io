import os
import uuid
import zipfile
import tempfile
import shutil
import base64
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from MONTAEDITAL.processador_docx import preencher_documento
from MONTAEDITAL.montador_variaveis import montar_variaveis_fixas

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://danihmorais.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELOS_DISPONIVEIS = {
    "dispensa": "modelos/Dispensa xx Proc xx -  MINUTA DP 13.07.2026.docx",
    "dispensa_bll": "modelos/Dispensa xx Proc xx -  MINUTA DE 13.07.2026.docx",
    "pregao_eletronico": "modelos/Pregão xx Proc xx -  MINUTA PE 13.07.2026.docx",
    "pregao_presencial": "modelos/Pregão xx Proc xx -  MINUTA PP 13.07.2026.docx"
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

class EditalRequest(BaseModel):
    tipo_edital: str
    dados_preenchimento: dict

def cleanup_temp_dir(path: str):
    shutil.rmtree(path, ignore_errors=True)

@app.post("/api/gerar-edital")
async def gerar_edital_endpoint(req: EditalRequest, background_tasks: BackgroundTasks):
    caminho_modelo = os.path.join(BASE_DIR, MODELOS_DISPONIVEIS.get(req.tipo_edital, ""))

    if req.tipo_edital not in MODELOS_DISPONIVEIS or not os.path.exists(caminho_modelo):
        raise HTTPException(status_code=400, detail=f"Modelo não encontrado para o tipo: {req.tipo_edital}")

    session_id = uuid.uuid4().hex
    temp_dir = tempfile.mkdtemp(prefix=f"edital_{session_id}_")
    
    background_tasks.add_task(cleanup_temp_dir, temp_dir)
    
    dados_processados = montar_variaveis_fixas(req.dados_preenchimento)

    for key, ph in [("DFD_B64", "{{DFD}}"), ("ETP_B64", "{{ETP}}"), ("TR_B64", "{{TR}}")]:
        if key in req.dados_preenchimento and req.dados_preenchimento[key]:
            file_path = os.path.join(temp_dir, f"{key}.docx")
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(req.dados_preenchimento[key]))
            dados_processados[ph] = file_path
    
    modalidade_raw = dados_processados.get("{{MODALIDADE}}", "PREGAO_ELETRONICO")
    mod_abr = MOD_ABR_MAP.get(modalidade_raw, "PE")
    modalidade_nome = MODALIDADE_TEXTO.get(modalidade_raw, "Pregão Eletrônico")
    
    num_mod_raw = str(dados_processados.get("{{N.MODALIDADE}}", "00"))
    num_proc_raw = str(dados_processados.get("{{N.PROCESSO}}", "00"))
    
    num_mod_arq = num_mod_raw.replace("/", "-").replace("\\", "-")
    num_proc_arq = num_proc_raw.replace("/", "-").replace("\\", "-")
    
    dados_edital = dados_processados.copy()
    dados_edital["{{MINUTA DE}}"] = ""
    nome_arq_edital = f"{modalidade_nome} {num_mod_arq} Proc {num_proc_arq} - {mod_abr} 13.07.2026.docx"
    caminho_edital = os.path.join(temp_dir, nome_arq_edital)
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
    nome_arq_minuta = f"{modalidade_nome} XX Proc {num_proc_arq} - MINUTA DE {mod_abr} 13.07.2026.docx"
    caminho_minuta = os.path.join(temp_dir, nome_arq_minuta)
    preencher_documento(caminho_modelo, caminho_minuta, dados_minuta)

    zip_filename = f"Editais_{num_mod_arq}_{session_id[:6]}.zip"
    caminho_zip = os.path.join(temp_dir, zip_filename)
    
    with zipfile.ZipFile(caminho_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(caminho_edital, nome_arq_edital)
        zipf.write(caminho_minuta, nome_arq_minuta)
        
    return FileResponse(
        path=caminho_zip,
        filename=zip_filename,
        media_type="application/zip"
    )
