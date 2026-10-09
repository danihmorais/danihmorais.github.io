import React, { useState } from "react";
import type { DocumentosReferenciaUpload } from "../api";

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dados: {
    instrucoes: string;
    email: string;
    arquivos: DocumentosReferenciaUpload;
  }) => void;
}

export default function PromptModal({ isOpen, onClose, onConfirm }: PromptModalProps) {
  const [texto, setTexto] = useState("");
  const [email, setEmail] = useState("");
  const [arquivos, setArquivos] = useState<DocumentosReferenciaUpload>({});

  if (!isOpen) return null;

  const emailValido = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim());

  const definirArquivo = (campo: keyof DocumentosReferenciaUpload, arquivo: File | null) => {
    setArquivos((atual) => ({ ...atual, [campo]: arquivo }));
  };

  const handleConfirmar = () => {
    if (!emailValido) return;
    onConfirm({ instrucoes: texto.trim(), email: email.trim(), arquivos });
    setTexto("");
    setArquivos({});
  };

  const handleCancelar = () => {
    onClose();
    setTexto("");
    setArquivos({});
  };

  const campos: Array<{ chave: keyof DocumentosReferenciaUpload; titulo: string; descricao: string }> = [
    { chave: "dfd", titulo: "DFD anterior", descricao: "Use o DFD de processo anterior como referência principal." },
    { chave: "etp", titulo: "ETP anterior", descricao: "Use o ETP de processo anterior como referência principal." },
    { chave: "tr", titulo: "TR anterior", descricao: "Use o TR de processo anterior como referência principal." },
    { chave: "edital", titulo: "Edital / Aviso de Dispensa", descricao: "O backend recorta automaticamente apenas os anexos DFD, ETP e TR." },
  ];

  return (
    <div className="prompt-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancelar(); }}>
      <div className="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title" aria-describedby="prompt-modal-description">
        <div className="prompt-heading">
          <div className="prompt-heading-copy">
            <span className="prompt-eyebrow">ÚLTIMA ETAPA · ENVIO</span>
            <h2 id="prompt-modal-title">Confeccionar documentos</h2>
          </div>
          <button type="button" className="prompt-close" onClick={handleCancelar} aria-label="Fechar janela">×</button>
        </div>
        <p className="prompt-lead" id="prompt-modal-description">
          Confira o e-mail de recebimento e, se necessário, anexe documentos de um processo anterior. Os arquivos são usados como referência para a elaboração dos novos documentos.
        </p>

        <div className="prompt-section">
          <span className="prompt-section-label">Documentos de referência <span className="optional-label">OPCIONAL</span></span>
          <div className="reference-grid">
            {campos.map((campo, index) => {
              const arquivo = arquivos[campo.chave];
              return (
                <label key={campo.chave} className={"reference-card" + (arquivo ? " has-file" : "")}>
                  <span className="reference-card-title">
                    <span className="reference-card-icon">{String(index + 1).padStart(2, "0")}</span>
                    {campo.titulo}
                  </span>
                  <span className="reference-card-description">{campo.descricao}</span>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    aria-label={"Anexar " + campo.titulo}
                    onChange={(e) => definirArquivo(campo.chave, e.target.files?.[0] || null)}
                  />
                  {arquivo && <span className="reference-file-name">✓ {arquivo.name}</span>}
                </label>
              );
            })}
          </div>
          <p className="reference-footnote">
            Formatos aceitos: PDF e DOCX. Documentos digitalizados podem passar por OCR quando não houver texto extraível. Ao anexar um Edital/Aviso, apenas os anexos DFD, ETP e TR encontrados serão encaminhados como contexto.
          </p>
        </div>

        <label className="prompt-field">
          E-mail para recebimento <span className="required-mark">*</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailValido) handleConfirmar();
            }}
            placeholder="nome@instituicao.gov.br"
            autoFocus
            autoComplete="email"
            required
          />
          <span className="field-hint">O arquivo ZIP final será enviado para este endereço.</span>
        </label>

        <label className="prompt-field">
          Instruções adicionais para a IA <span className="optional-label">OPCIONAL</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Indique regras específicas, pontos de atenção ou referências importantes para esta contratação..."
          />
          <span className="field-hint">As instruções serão consideradas junto com os dados informados nas cinco etapas.</span>
        </label>

        <div className="prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={handleCancelar}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirmar} disabled={!emailValido}>
            Colocar na fila <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
