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
    "dispensa": "modelos/Dispensa xx Proc xx -  MINUTA DP.docx",
    "dispensa_bll": "modelos/Dispensa xx Proc xx -  MINUTA DE.docx",
    "pregao_eletronico": "modelos/Pregão xx Proc xx -  MINUTA PE.docx",
    "pregao_presencial": "modelos/Pregão xx Proc xx -  MINUTA PP.docx",
    "leilao_eletronico": "modelos/Leilão xx Proc xx -  MINUTA LE.docx"
}

MOD_ABR_MAP = {
    "PREGAO_PRESENCIAL": "PP",
    "PREGAO_ELETRONICO": "PE",
    "LEILAO_ELETRONICO": "LE",
    "DISPENSA_BLL": "DE",
    "DISPENSA": "DP"
}

MODALIDADE_TEXTO = {
    "PREGAO_ELETRONICO": "Pregão Eletrônico",
    "DISPENSA": "Dispensa",
    "DISPENSA_BLL": "Dispensa Eletrônica BLL",
    "PREGAO_PRESENCIAL": "Pregão Presencial",
    "LEILAO_ELETRONICO": "Leilão Eletrônico"
}

AVISO_MODELO = os.path.join(BASE_DIR, "modelos", "AVISO XX.XX.XXXX.rtf")

class EditalRequest(BaseModel):
    tipo_edital: str
    dados_preenchimento: dict

def cleanup_temp_dir(path: str):
    shutil.rmtree(path, ignore_errors=True)


def _rtf_visivel(rtf: str):
    """
    Retorna os caracteres visíveis do RTF com as posições no texto-fonte.
    Isso permite substituir placeholders mesmo quando o Word os dividiu
    entre vários runs/grupos RTF.
    """
    visiveis = []
    i = 0

    while i < len(rtf):
        ch = rtf[i]

        if ch in "{}":
            i += 1
            continue

        if ch != "\\":
            if ch not in "\r\n":
                visiveis.append((ch, i, i + 1))
            i += 1
            continue

        if i + 1 >= len(rtf):
            i += 1
            continue

        prox = rtf[i + 1]

        if prox in "{}\\":
            visiveis.append((prox, i, i + 2))
            i += 2
            continue

        if prox == "~":
            visiveis.append((" ", i, i + 2))
            i += 2
            continue

        if prox == "'":
            if i + 3 < len(rtf):
                try:
                    byte = bytes.fromhex(rtf[i + 2:i + 4])
                    visiveis.append((byte.decode("cp1252"), i, i + 4))
                    i += 4
                    continue
                except Exception:
                    pass
            i += 2
            continue

        if prox.isalpha():
            j = i + 1
            while j < len(rtf) and rtf[j].isalpha():
                j += 1

            palavra = rtf[i + 1:j]

            sinal = 1
            if j < len(rtf) and rtf[j] == "-":
                sinal = -1
                j += 1

            inicio_num = j
            while j < len(rtf) and rtf[j].isdigit():
                j += 1

            numero = rtf[inicio_num:j] if j > inicio_num else ""

            if palavra == "u" and numero:
                try:
                    valor = int(numero) * sinal
                    if valor < 0:
                        valor += 65536
                    visiveis.append((chr(valor), i, j))
                    if j < len(rtf) and rtf[j] == "?":
                        j += 1
                    i = j
                    continue
                except Exception:
                    pass

            if j < len(rtf) and rtf[j] == " ":
                j += 1

            i = j
            continue

        # Demais símbolos de controle RTF (\*, \-, etc.)
        i += 2

    return visiveis


def _rtf_escape_texto(valor) -> str:
    texto = str(valor or "")
    partes = []

    for ch in texto:
        if ch == "\\":
            partes.append(r"\\")
        elif ch == "{":
            partes.append(r"\{")
        elif ch == "}":
            partes.append(r"\}")
        elif ch == "\n":
            partes.append(r"\line ")
        elif ord(ch) < 128:
            partes.append(ch)
        else:
            try:
                byte = ch.encode("cp1252")
                partes.append("".join(f"\\'{b:02x}" for b in byte))
            except UnicodeEncodeError:
                code = ord(ch)
                signed = code if code <= 32767 else code - 65536
                partes.append(f"\\u{signed}?")

    return "".join(partes)


def _substituir_placeholders_rtf(rtf: str, substituicoes: dict) -> str:
    visiveis = _rtf_visivel(rtf)
    texto_visivel = "".join(item[0] for item in visiveis)
    alteracoes = []

    for placeholder, valor in substituicoes.items():
        inicio_busca = 0

        while True:
            indice = texto_visivel.find(placeholder, inicio_busca)
            if indice < 0:
                break

            fim = indice + len(placeholder)
            primeira = visiveis[indice]
            alteracoes.append((primeira[1], primeira[2], _rtf_escape_texto(valor)))

            for pos in range(indice + 1, fim):
                alteracoes.append((visiveis[pos][1], visiveis[pos][2], ""))

            inicio_busca = fim

    for inicio, fim, substituto in sorted(alteracoes, key=lambda item: item[0], reverse=True):
        rtf = rtf[:inicio] + substituto + rtf[fim:]

    return rtf


def _data_para_nome_aviso(data_str: str) -> str:
    if not data_str:
        return "XX.XX.XXXX"

    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            data = datetime.strptime(str(data_str).strip(), formato)
            return data.strftime("%d.%m.%Y")
        except Exception:
            continue

    return "XX.XX.XXXX"


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
    nome_arq_edital = f"{modalidade_nome} {num_mod_arq} Proc {num_proc_arq} - {mod_abr}.docx"
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
    nome_arq_minuta = f"{modalidade_nome} XX Proc {num_proc_arq} - MINUTA DE {mod_abr}.docx"
    caminho_minuta = os.path.join(temp_dir, nome_arq_minuta)
    preencher_documento(caminho_modelo, caminho_minuta, dados_minuta)

    zip_filename = f"Editais_{num_mod_arq}_{session_id[:6]}.zip"
    caminho_zip = os.path.join(temp_dir, zip_filename)
    
    caminho_aviso = None
    nome_arq_aviso = None

    publicar_diario_estadual = bool(req.dados_preenchimento.get("publicar_diario_estadual", False))
    publicar_diario_federal = bool(req.dados_preenchimento.get("publicar_diario_federal", False))

    if publicar_diario_estadual or publicar_diario_federal:
        if not os.path.exists(AVISO_MODELO):
            raise HTTPException(status_code=500, detail="Modelo de Aviso de Edital não encontrado.")

        with open(AVISO_MODELO, "rb") as f:
            aviso_rtf = f.read().decode("cp1252")

        cad_prot_env = {
            "DISPENSA": "Envio ou Protocolo",
            "DISPENSA_BLL": "Cadastro",
            "PREGAO_ELETRONICO": "Cadastro",
            "PREGAO_PRESENCIAL": "Protocolo",
            "LEILAO_ELETRONICO": "Cadastro",
        }.get(modalidade_raw, "Cadastro")

        data_sessao_aviso = dados_processados.get("{{DATA DA SESSAO}}", "")
        if modalidade_raw == "DISPENSA":
            data_sessao_aviso = dados_processados.get(
                "{{DATA DA SESSAO2}}",
                data_sessao_aviso,
            )

        dados_aviso = {
            "{{MODALIDADE}}": modalidade_nome,
            "{{N.MODALIDADE}}": num_mod_raw,
            "{{N.PROCESSO}}": num_proc_raw,
            "{{OBJETO}}": dados_processados.get("{{OBJETO}}", ""),
            "{{CAD.PROT.ENV}}": cad_prot_env,
            "{{DATA REC PROP1}}": dados_processados.get("{{DATA REC PROP1}}", ""),
            "{{DATA DA SESSAO_AVISO}}": data_sessao_aviso,
            "{{HORA FIM DO REC}}": dados_processados.get("{{HORA FIM DO REC}}", ""),
            "{{DATA DA SESSAO}}": dados_processados.get("{{DATA DA SESSAO}}", ""),
            "{{HORA SESSAO}}": dados_processados.get("{{HORA SESSAO}}", ""),
            "{{DATA DO EDITAL}}": dados_processados.get("{{DATA DO EDITAL}}", ""),
        }

        aviso_rtf = _substituir_placeholders_rtf(aviso_rtf, dados_aviso)

        data_nome_aviso = _data_para_nome_aviso(
            req.dados_preenchimento.get("{{DATA DO EDITAL}}", "")
        )
        nome_arq_aviso = f"AVISO {data_nome_aviso}.rtf"
        caminho_aviso = os.path.join(temp_dir, nome_arq_aviso)

        with open(caminho_aviso, "wb") as f:
            f.write(aviso_rtf.encode("cp1252"))

    with zipfile.ZipFile(caminho_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(caminho_edital, nome_arq_edital)
        zipf.write(caminho_minuta, nome_arq_minuta)
        if caminho_aviso and nome_arq_aviso:
            zipf.write(caminho_aviso, nome_arq_aviso)
        
    return FileResponse(
        path=caminho_zip,
        filename=zip_filename,
        media_type="application/zip"
    )
