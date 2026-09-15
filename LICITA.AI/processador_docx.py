import os
import re
import json
import base64
import io
from copy import deepcopy
from docx import Document
from docx.shared import RGBColor, Inches
from docx.oxml.ns import qn

PLACEHOLDER_RE = re.compile(r"\{\{\s*[^{}]+?\s*\}\}")


def _safe_color_rgb(run):
    try:
        color = run.font.color
        if color.type is not None:
            return color.rgb
    except Exception:
        pass
    return None


def extrair_placeholders_documento(caminho_docx):
    doc = Document(caminho_docx)
    placeholders = set()

    def coletar(texto):
        placeholders.update(PLACEHOLDER_RE.findall(texto or ""))

    def iterar_blocos(blocos):
        for b in blocos:
            for p in getattr(b, "paragraphs", []):
                coletar(p.text)
            for t in getattr(b, "tables", []):
                for r in t.rows:
                    for c in r.cells:
                        for p in c.paragraphs:
                            coletar(p.text)

    iterar_blocos([doc])
    for section in doc.sections:
        iterar_blocos([section.header, section.footer])

    return placeholders


def extrair_placeholders_modelos(pasta_modelos, arquivos_base):
    placeholders = set()
    for arquivo in arquivos_base:
        caminho = os.path.join(pasta_modelos, arquivo)
        if os.path.exists(caminho):
            placeholders.update(extrair_placeholders_documento(caminho))
    return placeholders


def _copy_numbering_properties(source_paragraph, target_paragraph):
    if source_paragraph._p.pPr is None or source_paragraph._p.pPr.numPr is None:
        return
    target_pPr = target_paragraph._p.get_or_add_pPr()
    for child in list(target_pPr):
        if child.tag == qn("w:numPr"):
            target_pPr.remove(child)
    target_pPr.append(deepcopy(source_paragraph._p.pPr.numPr))


def _split_linear_content_for_paragraphs(linear_content):
    paragraphs = [[]]
    for segment in linear_content:
        if "\n" in segment["text"]:
            parts = segment["text"].split("\n")
            for i, part in enumerate(parts):
                paragraphs[-1].append({**segment, "text": part})
                if i < len(parts) - 1:
                    paragraphs.append([])
        else:
            paragraphs[-1].append(segment)
    return paragraphs


def _replace_in_linear_content(linear_content, old_text, new_text):
    if not old_text:
        return linear_content

    texto_completo = "".join(segment["text"] for segment in linear_content)
    inicio = texto_completo.find(old_text)
    if inicio == -1:
        return linear_content
    fim = inicio + len(old_text)

    acumulado = 0
    inicio_segmento = None
    inicio_offset = 0
    fim_segmento = None
    fim_offset = 0

    for index, segment in enumerate(linear_content):
        proximo = acumulado + len(segment["text"])
        if inicio_segmento is None and inicio < proximo:
            inicio_segmento = index
            inicio_offset = inicio - acumulado
        if fim <= proximo:
            fim_segmento = index
            fim_offset = fim - acumulado
            break
        acumulado = proximo

    if inicio_segmento is None or fim_segmento is None:
        return linear_content

    novo = []
    novo.extend(linear_content[:inicio_segmento])

    segmento_inicio = linear_content[inicio_segmento]
    segmento_fim = linear_content[fim_segmento]

    prefixo = segmento_inicio["text"][:inicio_offset]
    sufixo = segmento_fim["text"][fim_offset:]

    if prefixo:
        novo.append({**segmento_inicio, "text": prefixo})

    if str(new_text):
        novo.append({**segmento_inicio, "text": str(new_text)})

    if sufixo:
        novo.append({**segmento_fim, "text": sufixo})

    novo.extend(linear_content[fim_segmento + 1:])
    return novo


def _inserir_tabela(paragraph, json_str):
    try:
        dados = json.loads(json_str)
        if not isinstance(dados, list) or not dados:
            return
        itens_validos = [item for item in dados if isinstance(item, dict)]
        if not itens_validos:
            return
        colunas = list(dict.fromkeys(
            key
            for item in itens_validos
            for key in item.keys()
        ))
        if not colunas:
            return

        parent = paragraph._parent
        table = parent.add_table(rows=1, cols=len(colunas), width=Inches(6.0))
        table.style = "Table Grid"
        hdr_cells = table.rows[0].cells
        for i, key in enumerate(colunas):
            hdr_cells[i].text = str(key)
        for item in itens_validos:
            row_cells = table.add_row().cells
            for i, key in enumerate(colunas):
                row_cells[i].text = str(item.get(key, ""))
        paragraph._p.addnext(table._tbl)
    except Exception as e:
        new_run = paragraph.add_run(f"[ERRO AO GERAR TABELA: {e}]")
        new_run.font.color.rgb = RGBColor(255, 0, 0)
        new_run.bold = True


def _adicionar_run_preservando_formatacao(paragraph, text, original_run_data):
    if not text:
        return None
    new_run = paragraph.add_run()
    r_pr = original_run_data.get("rPr")
    if r_pr is not None:
        new_run._r.insert(0, deepcopy(r_pr))
    new_run.text = text
    return new_run


def _apply_segments_to_paragraph(paragraph, segments, extracted_runs_data):
    alinhamento_original = paragraph.alignment
    paragraph.clear()
    paragraph.alignment = alinhamento_original

    for segment in segments:
        if not segment.get("text"):
            continue

        original_run_data = extracted_runs_data[segment["original_run_index"]]
        parts = segment["text"].split("\n")

        for i, part in enumerate(parts):
            if part:
                if part.startswith("__IMG__"):
                    img_ref = part.replace("__IMG__", "")
                    try:
                        if img_ref.startswith("data:image"):
                            _, b64_data = img_ref.split(",", 1)
                            imagem_bytes = base64.b64decode(b64_data)
                            new_run = paragraph.add_run()
                            new_run.add_picture(io.BytesIO(imagem_bytes), width=Inches(6.0))
                        elif os.path.exists(img_ref):
                            new_run = paragraph.add_run()
                            new_run.add_picture(img_ref, width=Inches(6.0))
                        else:
                            raise FileNotFoundError(img_ref)
                    except Exception:
                        new_run = paragraph.add_run("[IMAGEM DE DOTAÇÃO NÃO PÔDE SER INSERIDA]")
                        new_run.font.color.rgb = RGBColor(255, 0, 0)
                        new_run.bold = True
                elif part.startswith("__TABLE__"):
                    json_str = part.replace("__TABLE__", "", 1)
                    _inserir_tabela(paragraph, json_str)
                else:
                    _adicionar_run_preservando_formatacao(paragraph, part, original_run_data)

            if i < len(parts) - 1:
                quebra = paragraph.add_run()
                r_pr = original_run_data.get("rPr")
                if r_pr is not None:
                    quebra._r.insert(0, deepcopy(r_pr))
                quebra.add_break()


def replace_text_in_paragraph(paragraph, replacements):
    extracted_runs_data = []
    for run in paragraph.runs:
        extracted_runs_data.append({
            "text": run.text or "",
            "rPr": deepcopy(run._r.rPr) if run._r.rPr is not None else None,
        })

    if not extracted_runs_data:
        return

    linear_content = [
        {"text": run_data["text"], "original_run_index": index}
        for index, run_data in enumerate(extracted_runs_data)
    ]

    for old_text, new_text in replacements.items():
        linear_content = _replace_in_linear_content(linear_content, old_text, new_text)

    list_paragraph = paragraph._p.pPr is not None and paragraph._p.pPr.numPr is not None
    paragraph_groups = _split_linear_content_for_paragraphs(linear_content) if list_paragraph else [linear_content]

    if len(paragraph_groups) == 1:
        _apply_segments_to_paragraph(paragraph, paragraph_groups[0], extracted_runs_data)
        return

    for segments in reversed(paragraph_groups[:-1]):
        new_para = paragraph.insert_paragraph_before(text=None, style=paragraph.style)
        _copy_numbering_properties(paragraph, new_para)
        _apply_segments_to_paragraph(new_para, segments, extracted_runs_data)

    _apply_segments_to_paragraph(paragraph, paragraph_groups[-1], extracted_runs_data)


def modificar_documento(cam_origem, cam_destino, modificacoes):
    doc = Document(cam_origem)

    def substituir_blocos(blocos):
        for b in blocos:
            for p in getattr(b, "paragraphs", []):
                replace_text_in_paragraph(p, modificacoes)
            for t in getattr(b, "tables", []):
                for r in t.rows:
                    for c in r.cells:
                        for p in c.paragraphs:
                            replace_text_in_paragraph(p, modificacoes)

    substituir_blocos([doc])
    for section in doc.sections:
        substituir_blocos([section.header, section.footer])

    doc.save(cam_destino)
