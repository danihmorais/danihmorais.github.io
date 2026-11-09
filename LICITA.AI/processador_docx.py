import os
import re
import json
import base64
import io
from copy import deepcopy
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import RGBColor, Inches
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.table import _Cell
from docx.text.paragraph import Paragraph

PLACEHOLDER_RE = re.compile(r"\{\{\s*[^{}]+?\s*\}\}")
_TITULO_NUMERADO_RE = re.compile(r"^\s*\d+(?:\.\d+)*\s*(?:[.)\-–—:]|\s)\s*\S")
# Caracteres que o XML do Word não aceita (python-docx levanta ValueError). Costumam chegar
# em textos colados de PDF (\x0c, \x0b) ou em saídas de IA.
_XML_INVALIDO_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def _limpar_texto_xml(texto) -> str:
    return _XML_INVALIDO_RE.sub("", str(texto))


def _iterar_paragrafos(container):
    """Percorre parágrafos do container e de tabelas, inclusive tabelas aninhadas em células."""
    for paragrafo in list(getattr(container, "paragraphs", [])):
        yield paragrafo
    for tabela in list(getattr(container, "tables", [])):
        for linha in list(tabela.rows):
            for celula in list(linha.cells):
                yield from _iterar_paragrafos(celula)


def extrair_placeholders_documento(caminho_docx):
    doc = Document(caminho_docx)
    placeholders = set()

    def coletar(texto):
        placeholders.update(PLACEHOLDER_RE.findall(texto or ""))

    def iterar_blocos(blocos):
        for b in blocos:
            for p in _iterar_paragrafos(b):
                coletar(p.text)

    iterar_blocos([doc])
    for section in doc.sections:
        iterar_blocos([section.header, section.footer])

    return placeholders


def _copy_paragraph_properties(source_paragraph, target_paragraph):
    source_pPr = source_paragraph._p.pPr
    if source_pPr is None:
        return
    target_pPr = target_paragraph._p.pPr
    if target_pPr is not None:
        target_paragraph._p.remove(target_pPr)
    target_paragraph._p.insert(0, deepcopy(source_pPr))


def _inserir_paragrafo_vazio_depois(paragraph):
    """Insere uma linha em branco logo após `paragraph`, com as mesmas propriedades (sem numeração)."""
    novo_p = OxmlElement("w:p")
    paragraph._p.addnext(novo_p)
    novo = Paragraph(novo_p, paragraph._parent)
    _copy_paragraph_properties(paragraph, novo)
    p_pr = novo._p.pPr
    if p_pr is not None:
        # Uma linha de respiro não pode herdar marcador/numeração de lista do parágrafo-modelo.
        for num_pr in p_pr.findall(qn("w:numPr")):
            p_pr.remove(num_pr)
    return novo


def _split_linear_content_for_paragraphs(linear_content):
    paragraphs = [[]]
    for segment in linear_content:
        text = segment["text"]
        if "\n" not in text:
            if text:
                paragraphs[-1].append(segment)
            continue

        parts = text.split("\n")
        for i, part in enumerate(parts):
            if part:
                paragraphs[-1].append({**segment, "text": part})

            if i < len(parts) - 1:
                # Vários "\n" seguidos representam uma única troca de
                # parágrafo. Não criamos parágrafos vazios entre eles.
                if paragraphs[-1]:
                    paragraphs.append([])

    # Uma quebra no fim do texto não deve criar um parágrafo vazio.
    while len(paragraphs) > 1 and not paragraphs[-1]:
        paragraphs.pop()

    return paragraphs


def _substituir_trecho(linear_content, inicio, fim, new_text):
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

    if new_text:
        novo.append({**segmento_inicio, "text": new_text})

    if sufixo:
        # O modelo do TR pode manter o próximo título numerado no mesmo parágrafo
        # do placeholder. A substituição deve encerrar o bloco antes desse título,
        # mesmo quando o texto gerado não termina com "\n".
        sufixo_sem_espacos = sufixo.lstrip(" \t")
        if _TITULO_NUMERADO_RE.match(sufixo_sem_espacos):
            if (
                new_text
                and not new_text.endswith(("\n", "\r"))
                and not sufixo_sem_espacos.startswith(("\n", "\r"))
            ):
                novo.append({**segmento_inicio, "text": "\n"})
            sufixo = sufixo_sem_espacos
        novo.append({**segmento_fim, "text": sufixo})

    novo.extend(linear_content[fim_segmento + 1:])
    return novo


def _replace_in_linear_content(linear_content, old_text, new_text):
    """Substitui todas as ocorrências de old_text (não apenas a primeira do parágrafo)."""
    if not old_text:
        return linear_content

    new_text = str(new_text)
    posicao = 0
    while True:
        texto_completo = "".join(segment["text"] for segment in linear_content)
        inicio = texto_completo.find(old_text, posicao)
        if inicio == -1:
            return linear_content
        linear_content = _substituir_trecho(linear_content, inicio, inicio + len(old_text), new_text)
        # Segue depois do texto inserido: se ele contiver old_text, não entra em laço infinito.
        posicao = inicio + len(new_text)


def _inserir_tabela(paragraph, json_str, *, centralizar=False, justificar_conteudo=False):
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
        if isinstance(parent, _Cell):
            # _Cell.add_table não aceita "width": usa a largura da própria célula.
            table = parent.add_table(rows=1, cols=len(colunas))
        else:
            table = parent.add_table(rows=1, cols=len(colunas), width=Inches(6.0))
        table.style = "Table Grid"
        if centralizar:
            table.alignment = WD_TABLE_ALIGNMENT.CENTER

        hdr_cells = table.rows[0].cells
        for i, key in enumerate(colunas):
            hdr_cells[i].text = _limpar_texto_xml(key)
        for item in itens_validos:
            row_cells = table.add_row().cells
            for i, key in enumerate(colunas):
                row_cells[i].text = _limpar_texto_xml(item.get(key, ""))

        if justificar_conteudo:
            for row in table.rows:
                for cell in row.cells:
                    for cell_paragraph in cell.paragraphs:
                        cell_paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        paragraph._p.addnext(table._tbl)
    except Exception as e:
        new_run = paragraph.add_run(f"[ERRO AO GERAR TABELA: {e}]")
        new_run.font.color.rgb = RGBColor(255, 0, 0)
        new_run.bold = True


def _adicionar_run_preservando_formatacao(paragraph, text, original_run_data):
    text = _limpar_texto_xml(text) if text else text
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
        part = segment["text"]
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
        elif part.startswith("__TABLE_CENTER_JUSTIFY__"):
            json_str = part.replace("__TABLE_CENTER_JUSTIFY__", "", 1)
            _inserir_tabela(paragraph, json_str, centralizar=True, justificar_conteudo=True)
        elif part.startswith("__TABLE__"):
            json_str = part.replace("__TABLE__", "", 1)
            _inserir_tabela(paragraph, json_str)
        else:
            _adicionar_run_preservando_formatacao(paragraph, part, original_run_data)


def replace_text_in_paragraph(paragraph, replacements):
    extracted_runs_data = []
    for run in paragraph.runs:
        extracted_runs_data.append({
            "text": run.text or "",
            "rPr": deepcopy(run._r.rPr) if run._r.rPr is not None else None,
        })

    if not extracted_runs_data:
        return

    # Não reconstrua um parágrafo que não contém nenhum texto a substituir.
    # Isso é essencial para preservar desenhos/imagens do modelo, inclusive
    # imagens inseridas nos cabeçalhos e rodapés.
    texto_original = "".join(run_data["text"] for run_data in extracted_runs_data)
    if not any(old_text and old_text in texto_original for old_text in replacements):
        return

    linear_content = [
        {"text": (run_data["text"] or "").replace("\r\n", "\n").replace("\r", "\n"), "original_run_index": index}
        for index, run_data in enumerate(extracted_runs_data)
    ]
    # Uma quebra de linha no fim do parágrafo-modelo é o "respiro" que o autor do modelo deixou antes
    # do próximo título. A divisão em parágrafos descarta quebras finais, então a linha em branco é
    # reposta depois do bloco; sem ela o último parágrafo gerado ficaria colado no título seguinte.
    espaco_final = "".join(item["text"] for item in linear_content).rstrip(" \t").endswith("\n")

    for old_text, new_text in replacements.items():
        linear_content = _replace_in_linear_content(linear_content, old_text, new_text)

    paragraph_groups = _split_linear_content_for_paragraphs(linear_content)

    if len(paragraph_groups) == 1:
        _apply_segments_to_paragraph(paragraph, paragraph_groups[0], extracted_runs_data)
        if espaco_final:
            _inserir_paragrafo_vazio_depois(paragraph)
        return

    for segments in paragraph_groups[:-1]:
        new_para = paragraph.insert_paragraph_before(text=None, style=paragraph.style)
        _copy_paragraph_properties(paragraph, new_para)
        new_para.paragraph_format.space_before = 0
        new_para.paragraph_format.space_after = 0
        _apply_segments_to_paragraph(new_para, segments, extracted_runs_data)

    # Quando um placeholder vira vários parágrafos, não deixe o espaçamento
    # do parágrafo-modelo criar uma "linha em branco" entre eles.
    paragraph.paragraph_format.space_before = 0
    paragraph.paragraph_format.space_after = 0
    _apply_segments_to_paragraph(paragraph, paragraph_groups[-1], extracted_runs_data)
    if espaco_final:
        _inserir_paragrafo_vazio_depois(paragraph)


def modificar_documento(cam_origem, cam_destino, modificacoes):
    doc = Document(cam_origem)

    def substituir_blocos(blocos):
        for b in blocos:
            for p in _iterar_paragrafos(b):
                replace_text_in_paragraph(p, modificacoes)

    substituir_blocos([doc])
    for section in doc.sections:
        substituir_blocos([section.header, section.footer])

    doc.save(cam_destino)
