
const MAX_DOTACAO_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DOTACAO_IMAGES = 8;

function inserirImagemNoCursor(src: string, alt = "Imagem da dotação"): boolean {

  if (!src || !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(src)) return false;
  const base64 = src.slice(src.indexOf(",") + 1);
  const bytes = Math.floor(base64.length * 3 / 4);
  if (bytes > MAX_DOTACAO_IMAGE_BYTES) return false;
  const editor = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const alvo = editor?.isContentEditable
    ? editor
    : document.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!alvo || alvo.querySelectorAll("img").length >= MAX_DOTACAO_IMAGES) return false;
  const imagem = document.createElement("img");
  imagem.src = src;
  imagem.alt = alt;
  imagem.loading = "lazy";
  imagem.className = "dotacao-editor-image";
  const selecao = window.getSelection();
  if (selecao && selecao.rangeCount > 0 && alvo.contains(selecao.getRangeAt(0).commonAncestorContainer)) {
    const range = selecao.getRangeAt(0);
    range.deleteContents();
    range.insertNode(imagem);
    range.setStartAfter(imagem);
    range.collapse(true);
    selecao.removeAllRanges();
    selecao.addRange(range);
  } else {
    alvo.appendChild(imagem);
  }
  return true;
}

function sanitizarHtmlColado(html: string): string {
  const documento = new DOMParser().parseFromString(html, "text/html");
  documento.querySelectorAll("script, style, iframe, object, embed, link, meta, form").forEach(no => no.remove());
  documento.body.querySelectorAll("*").forEach(elemento => {
    [...elemento.attributes].forEach(atributo => {
      const nome = atributo.name.toLowerCase();
      const valor = atributo.value.trim().toLowerCase();
      if (nome.startsWith("on") || nome === "style" || (nome === "src" && !valor.startsWith("data:image/"))) {
        elemento.removeAttribute(atributo.name);
      }
    });
  });
  documento.body.querySelectorAll("img").forEach(imagem => {
    const src = imagem.getAttribute("src") || "";
    if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(src) || Math.floor(src.length * 3 / 4) > MAX_DOTACAO_IMAGE_BYTES) {
      imagem.remove();
    } else {
      imagem.setAttribute("alt", imagem.getAttribute("alt") || "Imagem da dotação");
      imagem.setAttribute("class", "dotacao-editor-image");
      imagem.removeAttribute("onerror");
      imagem.removeAttribute("onload");
    }
  });
  return documento.body.innerHTML;
}

import React, { useCallback, useEffect, useRef } from "react";

export interface DotacaoBloco {
  tipo: "texto" | "imagem";
  texto?: string;
  imagemBase64?: string;
}

interface DotacaoEditorProps {
  value: DotacaoBloco[];
  onChange: (blocos: DotacaoBloco[]) => void;
  placeholder?: string;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function blocosParaHtml(blocos: DotacaoBloco[]): string {
  if (!blocos || blocos.length === 0) return "";
  return blocos
    .map((bloco) => {
      if (bloco.tipo === "imagem") {
        if (!bloco.imagemBase64) return "";
        return `<img class="dotacao-editor-image" src="${bloco.imagemBase64}" alt="Imagem da dotação" />`;
      }
      return (bloco.texto || "")
        .split("\n")
        .map((linha) =>
          escaparHtml(linha).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        )
        .join("<br/>");
    })
    .join("");
}

function serializarConteudo(container: HTMLElement): DotacaoBloco[] {
  const blocos: DotacaoBloco[] = [];
  let textoAtual = "";

  const flush = () => {
    if (textoAtual !== "") {
      blocos.push({ tipo: "texto", texto: textoAtual });
      textoAtual = "";
    }
  };

  const percorrer = (node: ChildNode, negrito: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const texto = node.textContent || "";
      if (!texto) return;
      textoAtual += negrito ? `**${texto}**` : texto;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "IMG") {
      flush();
      const src = el.getAttribute("src") || "";
      if (src) blocos.push({ tipo: "imagem", imagemBase64: src });
      return;
    }

    if (tag === "BR") {
      textoAtual += "\n";
      return;
    }

    const negritoAqui =
      negrito ||
      tag === "B" ||
      tag === "STRONG" ||
      (el.style && el.style.fontWeight === "bold");

    Array.from(el.childNodes).forEach((filho) => percorrer(filho, negritoAqui));

    if (tag === "DIV" || tag === "P") {
      textoAtual += "\n";
    }
  };

  Array.from(container.childNodes).forEach((n) => percorrer(n, false));
  flush();

  if (blocos.length > 0) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo.tipo === "texto" && ultimo.texto?.endsWith("\n")) {
      ultimo.texto = ultimo.texto.slice(0, -1);
    }
  }

  return blocos;
}

export default function DotacaoEditor({ value, onChange, placeholder }: DotacaoEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const montouRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current as HTMLElement | null;
    if (!editor) return;
    const conteudo = String(value ?? "");
    if (editor.innerHTML !== conteudo) editor.innerHTML = conteudo;
  }, [value]);


  useEffect(() => {
    if (montouRef.current) return;
    montouRef.current = true;
    if (editorRef.current) {
      editorRef.current.innerHTML = blocosParaHtml(value || []);
    }
  }, [value]);

  const sincronizar = useCallback(() => {
    if (editorRef.current) onChange(serializarConteudo(editorRef.current));
  }, [onChange]);

  const salvarSelecao = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restaurarSelecao = () => {
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const aplicarNegrito = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restaurarSelecao();
    const selecao = window.getSelection();
    if (!selecao || selecao.rangeCount === 0) return;
    const range = selecao.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const negrito = document.createElement("strong");
    if (range.collapsed) {
      range.insertNode(negrito);
      range.setStart(negrito, 0);
      range.collapse(true);
    } else {
      negrito.appendChild(range.extractContents());
      range.insertNode(negrito);
      range.selectNodeContents(negrito);
    }
    selecao.removeAllRanges();
    selecao.addRange(range);
    savedRangeRef.current = range.cloneRange();
    sincronizar();
  };

  const abrirSeletorImagem = () => {
    salvarSelecao();
    fileInputRef.current?.click();
  };

  const inserirImagens = async (files: File[]) => {
    if (!editorRef.current || files.length === 0) return;
    editorRef.current.focus();
    restaurarSelecao();

    for (const file of files) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        inserirImagemNoCursor(String(dataUrl));
      } else {
        const img = document.createElement("img");
        img.src = dataUrl;
        editorRef.current.appendChild(img);
      }
      salvarSelecao();
    }

    sincronizar();
  };

  return (
    <div className="dotacao-editor-container">
      <div className="dotacao-editor-shell">
        <div
          ref={editorRef}
          className="dotacao-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Editor de dotação orçamentária"
          aria-multiline="true"
          aria-describedby="dotacao-editor-hint"
          tabIndex={0}
          data-placeholder={placeholder}
          onInput={sincronizar}
          onBlur={sincronizar}
        onPaste={(evento) => {
            const html = evento.clipboardData.getData("text/html");
            if (!html) return;
            evento.preventDefault();
            const editor = evento.currentTarget as HTMLElement;
            const imagensAtuais = editor.querySelectorAll("img").length;
            const container = document.createElement("div");
            container.innerHTML = sanitizarHtmlColado(html);
            const imagens = [...container.querySelectorAll("img")];
            imagens.slice(Math.max(0, MAX_DOTACAO_IMAGES - imagensAtuais)).forEach(imagem => imagem.remove());
            const fragmento = document.createDocumentFragment();
            while (container.firstChild) fragmento.appendChild(container.firstChild);
            const selecao = window.getSelection();
            if (selecao && selecao.rangeCount > 0 && editor.contains(selecao.getRangeAt(0).commonAncestorContainer)) {
            const range = selecao.getRangeAt(0);
            range.deleteContents();
            range.insertNode(fragmento);
            } else {
            editor.appendChild(fragmento);
            }
          }}
        ></div>
        <div className="dotacao-editor-toolbar">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); salvarSelecao(); }}
            onClick={aplicarNegrito}
            title="Negrito (selecione o texto e clique)"
            className="dotacao-editor-button dotacao-editor-bold"
          >B</button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); abrirSeletorImagem(); }}
            title="Inserir uma ou várias imagens no ponto do cursor"
            className="dotacao-editor-button dotacao-editor-image-button"
          ><span style={{ fontSize: "14px" }}>🖼️</span> Inserir Imagem</button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="dotacao-editor-file-input"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) void inserirImagens(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="dotacao-hint" id="dotacao-editor-hint">
        Digite o texto e use o botão de imagem para inserir várias imagens no documento, inclusive intercaladas com o texto.
      </div>
    </div>
  );
}
