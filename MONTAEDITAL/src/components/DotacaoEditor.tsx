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

// Converte os blocos salvos (texto com marcadores **negrito** + imagens) no
// HTML inicial do editor contenteditable.
function blocosParaHtml(blocos: DotacaoBloco[]): string {
  if (!blocos || blocos.length === 0) return "";
  return blocos
    .map((bloco) => {
      if (bloco.tipo === "imagem") {
        if (!bloco.imagemBase64) return "";
        return `<img src="${bloco.imagemBase64}" />`;
      }
      const linhas = (bloco.texto || "").split("\n");
      return linhas
        .map((linha) => {
          const escapada = escaparHtml(linha).replace(
            /\*\*(.+?)\*\*/g,
            "<b>$1</b>"
          );
          return escapada;
        })
        .join("<br/>");
    })
    .join("");
}

// Percorre o DOM do editor e reconstrói a lista ordenada de blocos,
// preservando textos em negrito (**...**) e a posição das imagens
// no meio do conteúdo.
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
      negrito || tag === "B" || tag === "STRONG" || (el.style && el.style.fontWeight === "bold");

    Array.from(el.childNodes).forEach((filho) => percorrer(filho, negritoAqui));

    // Navegadores usam <div> ou <p> para quebras de linha dentro de
    // contenteditable — cada um vira uma nova linha no texto salvo.
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

  // Preenche o conteúdo inicial apenas uma vez (editor não-controlado
  // depois disso, para não perder a posição do cursor durante a digitação).
  useEffect(() => {
    if (montouRef.current) return;
    montouRef.current = true;
    if (editorRef.current) {
      editorRef.current.innerHTML = blocosParaHtml(value || []);
    }
  }, [value]);

  const sincronizar = useCallback(() => {
    if (editorRef.current) {
      onChange(serializarConteudo(editorRef.current));
    }
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
    editorRef.current?.focus();
    restaurarSelecao();
    document.execCommand("bold");
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
        document.execCommand("insertImage", false, dataUrl);
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
    <div>
      <div style={{ position: "relative" }}>
        <div
          ref={editorRef}
          className="wiz-textarea wiz-dotacao-editor"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          style={{ minHeight: "90px", paddingBottom: "40px", overflowY: "auto" }}
          onInput={sincronizar}
          onBlur={sincronizar}
        />
        <div style={{ position: "absolute", bottom: "8px", left: "8px", display: "flex", gap: "6px" }}>
          <button
            type="button"
            className="wiz-btn-ghost"
            onMouseDown={(e) => {
              e.preventDefault();
              salvarSelecao();
            }}
            onClick={aplicarNegrito}
            title="Negrito (selecione o texto e clique)"
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: "6px",
              background: "var(--wiz-surface)",
              border: "1px solid var(--wiz-border)",
              margin: 0,
            }}
          >
            B
          </button>
          <button
            type="button"
            className="wiz-btn-ghost"
            onMouseDown={(e) => {
              e.preventDefault();
              abrirSeletorImagem();
            }}
            title="Inserir imagem no ponto do cursor"
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              cursor: "pointer",
              borderRadius: "6px",
              display: "flex",
              gap: "6px",
              alignItems: "center",
              background: "var(--wiz-surface)",
              border: "1px solid var(--wiz-border)",
              margin: 0,
            }}
          >
            <span style={{ fontSize: "14px" }}>🖼️</span> Inserir Imagem
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) inserirImagens(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="wiz-dotacao-hint">
        Digite o texto e use os botões para deixar trechos em negrito ou inserir imagens no meio
        do conteúdo — dá pra intercalar texto e imagens livremente.
      </div>
    </div>
  );
}