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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://danihmorais.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FasePreparatoriaRequest(BaseModel):
    dados_ia: dict = {}
    dados_usuario: dict = {}
    preenchimentos_manuais: dict = {}


def _valor_vazio(valor):
    if valor is None:
        return True
    texto_lower = str(valor).strip().lower()
    return not texto_lower or texto_lower in [
        "não informado", "nã£o informado", "n?o informado",
        "nao informado", "[não informado]", "[nao informado]", "[n?o informado]"
    ]


def cleanup_temp_dir(path: str):
    shutil.rmtree(path, ignore_errors=True)


def _formata_moeda(v):
    s = f"{v:,.2f}"
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


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
        vazio1, vazio2 = _valor_vazio(val1), _valor_vazio(val2)
        if not vazio1 and vazio2:
            modificacoes[chave2] = val1
        elif not vazio2 and vazio1:
            modificacoes[chave1] = val2

    if _valor_vazio(modificacoes.get("{{MES_INICIO}}")):
        modificacoes["{{MES_INICIO}}"] = [
            "janeiro", "fevereiro", "março", "abril", "maio", "junho",
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
        ][datetime.now().month - 1]

    modificacoes.update(req.preenchimentos_manuais)

    # Resolve placeholders aninhados (uma chave referenciando outra)
    for _ in range(3):
        mudou = False
        for k, v in modificacoes.items():
            if isinstance(v, str) and "{{" in v:
                novo_v = v
                for sub_k, sub_v in modificacoes.items():
                    if sub_k != k and sub_k in novo_v and isinstance(sub_v, str):
                        novo_v = novo_v.replace(sub_k, sub_v)
                if novo_v != v:
                    modificacoes[k] = novo_v
                    mudou = True
        if not mudou:
            break

    itens_json = modificacoes.get("{{ITENS}}")
    if not _valor_vazio(itens_json):
        itens_str = str(itens_json)
        if itens_str.startswith("__TABLE__"):
            itens_str = itens_str.replace("__TABLE__", "")

        try:
            itens = json.loads(itens_str) if isinstance(itens_str, str) else itens_json

            itens_formatados = []
            itens_sem_valor = []

            for item in itens:
                try:
                    valor_unit = float(item.get("valor", 0))
                except (ValueError, TypeError):
                    valor_unit = 0.0

                try:
                    qtd = float(item.get("qtd", 0))
                except (ValueError, TypeError):
                    qtd = 0.0

                total = valor_unit * qtd

                itens_formatados.append({
                    "Item": item.get("numero", ""),
                    "Descrição": item.get("descricao", ""),
                    "UN": item.get("un", ""),
                    "Qtd": item.get("qtd", ""),
                    "Vlr Unit.": _formata_moeda(valor_unit),
                    "Total": _formata_moeda(total)
                })

                itens_sem_valor.append({
                    "Item": item.get("numero", ""),
                    "Descrição": item.get("descricao", ""),
                    "UN": item.get("un", ""),
                    "Qtd": item.get("qtd", "")
                })

            modificacoes["{{ITENS}}"] = f"__TABLE__{json.dumps(itens_formatados, ensure_ascii=False)}"
            modificacoes["{{ITENS_SEMVALOR}}"] = f"__TABLE__{json.dumps(itens_sem_valor, ensure_ascii=False)}"
        except Exception:
            if not str(itens_json).startswith("__TABLE__"):
                modificacoes["{{ITENS}}"] = f"__TABLE__{str(itens_json)}"

    arquivos_gerados = []
    for arq in config.BASE_FILES:
        cam_origem = os.path.join(config.PASTA_MODELOS, arq)
        cam_destino = os.path.join(temp_dir, f"Pronto_{arq}")
        if os.path.exists(cam_origem):
            modificar_documento(cam_origem, cam_destino, modificacoes)
            arquivos_gerados.append(cam_destino)

    if not arquivos_gerados:
        raise HTTPException(status_code=400, detail="Nenhum documento base encontrado.")

    zip_filename = f"FasePreparatoria_{session_id[:6]}.zip"
    caminho_zip = os.path.join(temp_dir, zip_filename)

    with zipfile.ZipFile(caminho_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
        for arq in arquivos_gerados:
            zipf.write(arq, os.path.basename(arq))

    return FileResponse(
        path=caminho_zip,
        filename=zip_filename,
        media_type="application/zip"
    )
