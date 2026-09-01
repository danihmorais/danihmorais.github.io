import os
import json
import uuid
import shutil
import zipfile
import tempfile
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import config
from montador_variaveis import montar_variaveis_fixas, filtrar_chaves_docx
from processador_docx import modificar_documento

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["https://danihmorais.github.io"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class FasePreparatoriaRequest(BaseModel):
    dados_ia: dict = {}
    dados_usuario: dict = {}
    preenchimentos_manuais: dict = {}
    modo_documento: str = "FASE_COMPLETA"

def _valor_vazio(valor):
    if valor is None: return True
    texto = str(valor).strip().lower()
    return not texto or texto in ["não informado", "nã£o informado", "n?o informado", "nao informado", "[não informado]", "[nao informado]", "[n?o informado]"]

def cleanup_temp_dir(path: str): shutil.rmtree(path, ignore_errors=True)
def _formata_moeda(v): return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

@app.post("/api/gerar-fase-preparatoria")
async def gerar_fase_preparatoria_endpoint(req: FasePreparatoriaRequest, background_tasks: BackgroundTasks):
    session_id = uuid.uuid4().hex
    temp_dir = tempfile.mkdtemp(prefix=f"fase_prep_{session_id}_")
    background_tasks.add_task(cleanup_temp_dir, temp_dir)
    modificacoes = filtrar_chaves_docx(montar_variaveis_fixas(req.dados_usuario))

    for chave, valor in req.dados_ia.items():
        chave_docx = chave if chave.startswith("{{") and chave.endswith("}}") else f"{{{{{chave}}}}}"
        modificacoes[chave_docx] = valor
    for chave1, chave2 in config.ALIASES:
        val1, val2 = modificacoes.get(chave1), modificacoes.get(chave2)
        if not _valor_vazio(val1) and _valor_vazio(val2): modificacoes[chave2] = val1
        elif not _valor_vazio(val2) and _valor_vazio(val1): modificacoes[chave1] = val2
    if _valor_vazio(modificacoes.get("{{MES_INICIO}}")):
        modificacoes["{{MES_INICIO}}"] = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][datetime.now().month - 1]
    modificacoes.update(req.preenchimentos_manuais)

    for _ in range(3):
        mudou = False
        for k, v in list(modificacoes.items()):
            if isinstance(v, str) and "{{" in v:
                novo = v
                for sub_k, sub_v in modificacoes.items():
                    if sub_k != k and sub_k in novo and isinstance(sub_v, str): novo = novo.replace(sub_k, sub_v)
                if novo != v: modificacoes[k] = novo; mudou = True
        if not mudou: break

    itens_json = modificacoes.get("{{ITENS}}")
    if not _valor_vazio(itens_json):
        try:
            itens_str = str(itens_json).replace("__TABLE__", "")
            itens = json.loads(itens_str) if isinstance(itens_str, str) else itens_json
            itens_formatados, itens_sem_valor = [], []
            for item in itens:
                try: valor_unit = float(item.get("valor", 0))
                except: valor_unit = 0.0
                try: qtd = float(item.get("qtd", 0))
                except: qtd = 0.0
                itens_formatados.append({"Item": item.get("numero", ""), "Descrição": item.get("descricao", ""), "UN": item.get("un", ""), "Qtd": item.get("qtd", ""), "Vlr Unit.": _formata_moeda(valor_unit), "Total": _formata_moeda(valor_unit*qtd)})
                itens_sem_valor.append({"Item": item.get("numero", ""), "Descrição": item.get("descricao", ""), "UN": item.get("un", ""), "Qtd": item.get("qtd", "")})
            modificacoes["{{ITENS}}"] = f"__TABLE__{json.dumps(itens_formatados, ensure_ascii=False)}"
            modificacoes["{{ITENS_SEMVALOR}}"] = f"__TABLE__{json.dumps(itens_sem_valor, ensure_ascii=False)}"
        except Exception:
            if not str(itens_json).startswith("__TABLE__"): modificacoes["{{ITENS}}"] = f"__TABLE__{itens_json}"

    # Compra direta/nota avulsa: gerar somente o DFD. O mesmo modelo DOCX do DFD
    # recebe conteúdo muito mais detalhado nos campos existentes, sem produzir ETP/TR.
    if req.modo_documento == "COMPRA_DIRETA":
        arquivos_base = ["DFD - BASE.docx"]
        prefixo = "DFD_Compra_Direta"
    else:
        arquivos_base = config.BASE_FILES
        prefixo = "FasePreparatoria"

    arquivos_gerados = []
    for arq in arquivos_base:
        origem = os.path.join(config.PASTA_MODELOS, arq)
        destino = os.path.join(temp_dir, f"Pronto_{arq}")
        if os.path.exists(origem):
            modificar_documento(origem, destino, modificacoes)
            arquivos_gerados.append(destino)
    if not arquivos_gerados: raise HTTPException(status_code=400, detail="Nenhum documento base encontrado.")

    zip_filename = f"{prefixo}_{session_id[:6]}.zip"
    caminho_zip = os.path.join(temp_dir, zip_filename)
    with zipfile.ZipFile(caminho_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
        for arq in arquivos_gerados: zipf.write(arq, os.path.basename(arq))
    return FileResponse(path=caminho_zip, filename=zip_filename, media_type="application/zip")
