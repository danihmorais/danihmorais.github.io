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
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - dependência obrigatória em produção
    fitz = None

try:
    import pytesseract
except ImportError:  # pragma: no cover - dependência obrigatória em produção
    pytesseract = None

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dependência obrigatória em produção
    Image = None

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - dependência obrigatória em produção
    PdfReader = None


MAX_DOCUMENT_CHARS = 45_000
MAX_CONTEXT_CHARS = 100_000
MIN_TEXT_FOR_OCR_PAGE = 80
OCR_DPI = 220
OCR_LANG = "por+eng"

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


def _ocr_imagem(imagem: object) -> str:
    if pytesseract is None or Image is None:
        raise RuntimeError(
            "OCR não está disponível no backend. Instale pytesseract, Pillow e o Tesseract OCR."
        )
    try:
        return _normalizar_texto(pytesseract.image_to_string(imagem, lang=OCR_LANG))
    except Exception as exc:
        try:
            return _normalizar_texto(pytesseract.image_to_string(imagem, lang="eng"))
        except Exception as fallback_exc:
            raise RuntimeError(
                "Não foi possível executar o OCR. Verifique se o Tesseract OCR e o idioma português estão instalados."
            ) from fallback_exc


def _ocr_pdf(data: bytes) -> str:
    if fitz is None:
        raise RuntimeError("OCR de PDF requer PyMuPDF no backend.")
    if pytesseract is None or Image is None:
        raise RuntimeError("OCR de PDF requer pytesseract e Pillow no backend.")

    paginas: list[str] = []
    try:
        with fitz.open(stream=data, filetype="pdf") as documento:
            for numero, pagina in enumerate(documento, start=1):
                texto_nativo = _normalizar_texto(pagina.get_text("text") or "")
                if len(texto_nativo) >= MIN_TEXT_FOR_OCR_PAGE:
                    paginas.append(f"--- PÁGINA {numero} ---\n{texto_nativo}")
                    continue

                pixmap = pagina.get_pixmap(dpi=OCR_DPI, alpha=False)
                imagem = Image.open(BytesIO(pixmap.tobytes("png")))
                texto_ocr = _ocr_imagem(imagem)
                if texto_ocr:
                    paginas.append(f"--- PÁGINA {numero} [OCR] ---\n{texto_ocr}")
                elif texto_nativo:
                    paginas.append(f"--- PÁGINA {numero} ---\n{texto_nativo}")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Não foi possível renderizar o PDF para OCR: {exc}") from exc

    return _normalizar_texto("\n\n".join(paginas))


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

    texto_nativo = _normalizar_texto("\n\n".join(blocos))
    if texto_nativo:
        return texto_nativo

    # DOCX totalmente escaneado: tenta OCR nas imagens incorporadas.
    if pytesseract is None or Image is None:
        raise RuntimeError(
            "O DOCX não contém texto selecionável e precisa de OCR. "
            "Instale pytesseract, Pillow e o Tesseract OCR."
        )

    imagens_ocr: list[str] = []
    for indice, rel_id in enumerate(documento.part.part.rels, start=1):
        rel = documento.part.part.rels[rel_id]
        if "image" not in rel.reltype:
            continue
        try:
            imagem = Image.open(BytesIO(rel.target_part.blob))
            texto = _ocr_imagem(imagem)
            if texto:
                imagens_ocr.append(f"--- IMAGEM {indice} [OCR] ---\n{texto}")
        except Exception:
            continue

    return _normalizar_texto("\n\n".join(imagens_ocr))


def _extrair_pdf(data: bytes) -> str:
    if PdfReader is None:
        raise RuntimeError("A biblioteca pypdf não está disponível no backend.")
    leitor = PdfReader(BytesIO(data))
    texto_nativo = _normalizar_texto(
        "\n\n".join(
            f"--- PÁGINA {numero} ---\n{_normalizar_texto(pagina.extract_text() or '')}"
            for numero, pagina in enumerate(leitor.pages, start=1)
            if _normalizar_texto(pagina.extract_text() or "")
        )
    )

    # OCR página a página somente quando a extração nativa não encontrou texto
    # suficiente no documento inteiro. O renderer do PyMuPDF permite tratar PDFs
    # mistos (algumas páginas digitais e outras escaneadas).
    try:
        if texto_nativo and len(texto_nativo.replace("PÁGINA", "")) >= MIN_TEXT_FOR_OCR_PAGE:
            # Mesmo em PDFs digitais, páginas individuais quase vazias podem ser
            # imagens. O OCR detalhado abaixo é acionado apenas nessas páginas.
            if fitz is None:
                return texto_nativo

            with fitz.open(stream=data, filetype="pdf") as documento:
                resultado: list[str] = []
                paginas_nativas = [pagina.get_text("text") or "" for pagina in documento]
                for numero, texto in enumerate(paginas_nativas, start=1):
                    texto_limpo = _normalizar_texto(texto)
                    if len(texto_limpo) >= MIN_TEXT_FOR_OCR_PAGE:
                        resultado.append(f"--- PÁGINA {numero} ---\n{texto_limpo}")
                    else:
                        pagina = documento.load_page(numero - 1)
                        pixmap = pagina.get_pixmap(dpi=OCR_DPI, alpha=False)
                        imagem = Image.open(BytesIO(pixmap.tobytes("png")))
                        texto_ocr = _ocr_imagem(imagem)
                        if texto_ocr:
                            resultado.append(f"--- PÁGINA {numero} [OCR] ---\n{texto_ocr}")
                        elif texto_limpo:
                            resultado.append(f"--- PÁGINA {numero} ---\n{texto_limpo}")
                return _normalizar_texto("\n\n".join(resultado))
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Não foi possível complementar o PDF com OCR: {exc}") from exc

    # PDF totalmente escaneado ou sem camada de texto.
    return _ocr_pdf(data)


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
            f"Não foi possível extrair texto de '{nome}' mesmo após tentativa automática de OCR. "
            "Verifique se o arquivo contém conteúdo legível."
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
