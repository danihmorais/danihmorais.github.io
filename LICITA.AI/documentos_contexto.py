from __future__ import annotations

import hashlib
import re
from io import BytesIO
from pathlib import Path
from typing import Iterable

from docx.document import Document as DocumentClass
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph
from docx import Document

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - dependência obrigatória em produção
    PdfReader = None


MAX_DOCUMENT_CHARS = 45_000
MAX_CONTEXT_CHARS = 100_000

ANEXO_RE = re.compile(
    r"(?im)^\s*ANEXO(?:\s+(?:ÚNICO|[IVXLCDM]+|\d+))?\b[^\n]{0,240}$"
)

TIPO_PATTERNS = {
    "DFD": (
        re.compile(r"documento\s+de\s+formaliza[cç][aã]o\s+da\s+demanda", re.I),
        re.compile(r"\bDFD\b", re.I),
    ),
    "ETP": (
        re.compile(r"estudo\s+t[eé]cnico\s+preliminar", re.I),
        re.compile(r"\bETP\b", re.I),
    ),
    "TR": (
        re.compile(r"termo\s+de\s+refer[eê]ncia", re.I),
    ),
}

EXTENSOES_SUPORTADAS = {".pdf", ".docx", ".txt"}


def _normalizar_texto(texto: str) -> str:
    texto = str(texto or "").replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    linhas: list[str] = []
    vazio_anterior = False
    for linha in texto.split("\n"):
        linha = re.sub(r"[ \t]+", " ", linha).strip()
        if not linha:
            if not vazio_anterior:
                linhas.append("")
            vazio_anterior = True
            continue
        linhas.append(linha)
        vazio_anterior = False
    return "\n".join(linhas).strip()


def _iter_block_items(parent: DocumentClass | _Cell) -> Iterable[Paragraph | Table]:
    if isinstance(parent, DocumentClass):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        raise TypeError(f"Tipo de documento DOCX não suportado: {type(parent)!r}")

    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def _extrair_docx(data: bytes) -> str:
    documento = Document(BytesIO(data))
    blocos: list[str] = []
    for bloco in _iter_block_items(documento):
        if isinstance(bloco, Paragraph):
            texto = bloco.text
        else:
            linhas = []
            for row in bloco.rows:
                celulas = [re.sub(r"\s+", " ", cell.text).strip() for cell in row.cells]
                linhas.append(" | ".join(celulas))
            texto = "\n".join(linhas)
        texto = _normalizar_texto(texto)
        if texto:
            blocos.append(texto)
    return _normalizar_texto("\n\n".join(blocos))


def _extrair_pdf(data: bytes) -> str:
    if PdfReader is None:
        raise RuntimeError("A biblioteca pypdf não está disponível no backend.")
    reader = PdfReader(BytesIO(data))
    paginas: list[str] = []
    for numero, pagina in enumerate(reader.pages, start=1):
        texto = _normalizar_texto(pagina.extract_text() or "")
        if texto:
            paginas.append(f"--- PÁGINA {numero} ---\n{texto}")
    return _normalizar_texto("\n\n".join(paginas))


def extrair_texto_arquivo(nome: str, data: bytes) -> str:
    extensao = Path(str(nome or "")).suffix.lower()
    if extensao not in EXTENSOES_SUPORTADAS:
        raise ValueError(
            f"Formato não suportado para '{nome}'. Utilize arquivo PDF ou DOCX."
        )
    if not data:
        raise ValueError(f"O arquivo '{nome}' está vazio.")

    if extensao == ".docx":
        texto = _extrair_docx(data)
    elif extensao == ".pdf":
        texto = _extrair_pdf(data)
    else:
        texto = _normalizar_texto(data.decode("utf-8", errors="replace"))

    if not texto:
        raise ValueError(
            f"Não foi possível extrair texto de '{nome}'. "
            "Verifique se o arquivo contém texto selecionável; PDFs digitalizados podem exigir OCR."
        )
    return texto


def _classificar_anexo(trecho: str, cabecalho: str) -> str | None:
    # Primeiro usa o próprio cabeçalho do anexo, onde normalmente está o título.
    cab = _normalizar_texto(cabecalho)
    for tipo, padroes in TIPO_PATTERNS.items():
        if any(padrao.search(cab) for padrao in padroes):
            return tipo

    # Depois procura o primeiro título explícito no início do anexo.
    inicio = _normalizar_texto(trecho[:1800])
    candidatos: list[tuple[int, str]] = []
    for tipo, padroes in TIPO_PATTERNS.items():
        for padrao in padroes:
            encontrado = padrao.search(inicio)
            if encontrado:
                candidatos.append((encontrado.start(), tipo))
                break

    if candidatos:
        candidatos.sort(key=lambda item: (item[0], ("DFD", "ETP", "TR").index(item[1])))
        return candidatos[0][1]

    return None


def extrair_anexos_dfd_etp_tr(texto_edital: str, nome_edital: str) -> list[dict]:
    texto = _normalizar_texto(texto_edital)
    marcadores = list(ANEXO_RE.finditer(texto))
    documentos: list[dict] = []

    if not marcadores:
        raise ValueError(
            f"Não foram encontrados marcadores de ANEXO em '{nome_edital}'. "
            "Não foi possível localizar automaticamente DFD, ETP ou TR."
        )

    for indice, marcador in enumerate(marcadores):
        inicio = marcador.start()
        fim = marcadores[indice + 1].start() if indice + 1 < len(marcadores) else len(texto)
        trecho = _normalizar_texto(texto[inicio:fim])
        cabecalho = _normalizar_texto(marcador.group(0))
        tipo = _classificar_anexo(trecho, cabecalho)
        if not tipo:
            continue

        if len(trecho) > MAX_DOCUMENT_CHARS:
            raise ValueError(
                f"O anexo {tipo} encontrado em '{nome_edital}' possui {len(trecho):,} caracteres, "
                f"acima do limite de {MAX_DOCUMENT_CHARS:,}. Envie o DFD/ETP/TR diretamente em arquivo separado."
            )

        documentos.append(
            {
                "tipo": tipo,
                "nome": f"{nome_edital} — {cabecalho}",
                "origem": "anexo_do_edital",
                "texto": trecho,
            }
        )

    if not documentos:
        raise ValueError(
            f"Os anexos de '{nome_edital}' foram identificados, mas nenhum deles foi reconhecido "
            "como DFD, ETP ou TR."
        )
    return documentos


def _adicionar_documento(documentos: list[dict], documento: dict) -> None:
    texto = _normalizar_texto(documento.get("texto", ""))
    if not texto:
        return
    if len(texto) > MAX_DOCUMENT_CHARS:
        raise ValueError(
            f"O documento '{documento.get('nome', 'arquivo')}' possui {len(texto):,} caracteres, "
            f"acima do limite de {MAX_DOCUMENT_CHARS:,}."
        )
    documento = {**documento, "texto": texto}
    assinatura = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    if any(item.get("_hash") == assinatura for item in documentos):
        return
    documento["_hash"] = assinatura
    documentos.append(documento)


def extrair_contexto_documentos(
    arquivos: dict[str, tuple[str, bytes] | None],
) -> dict:
    """
    Recebe os uploads por campo:
      dfd, etp, tr: documentos anteriores completos;
      edital: edital/aviso de dispensa do qual serão recortados somente
      os anexos reconhecidos como DFD, ETP e TR.
    """
    documentos: list[dict] = []

    for campo, tipo in (("dfd", "DFD"), ("etp", "ETP"), ("tr", "TR")):
        arquivo = arquivos.get(campo)
        if arquivo is None:
            continue
        nome, data = arquivo
        texto = extrair_texto_arquivo(nome, data)
        _adicionar_documento(
            documentos,
            {
                "tipo": tipo,
                "nome": nome,
                "origem": "documento_anterior",
                "texto": texto,
            },
        )

    edital = arquivos.get("edital")
    if edital is not None:
        nome, data = edital
        texto_edital = extrair_texto_arquivo(nome, data)
        for documento in extrair_anexos_dfd_etp_tr(texto_edital, nome):
            _adicionar_documento(documentos, documento)

    total = sum(len(item["texto"]) for item in documentos)
    if total > MAX_CONTEXT_CHARS:
        raise ValueError(
            f"O conjunto de documentos de referência possui {total:,} caracteres, "
            f"acima do limite de {MAX_CONTEXT_CHARS:,}. "
            "Reduza a quantidade de documentos ou envie apenas os mais relevantes."
        )
    if not documentos:
        raise ValueError("Nenhum documento de referência foi enviado.")

    for documento in documentos:
        documento.pop("_hash", None)

    return {
        "documentos": documentos,
        "total_caracteres": total,
        "quantidade": len(documentos),
    }
