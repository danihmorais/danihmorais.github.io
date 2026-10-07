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
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "24px" }}>
      <div style={{ background: "var(--bg-panel)", width: "100%", maxWidth: "900px", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: "24px", padding: "32px", boxShadow: "var(--shadow-lg)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", color: "var(--text-main)" }}>Enviar para a fila de geração</h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--text-muted)" }}>
          Você pode anexar documentos de um processo anterior. Eles serão usados como referência prioritária pela IA. Ao enviar um Edital/Aviso, o backend procura e recorta somente os anexos de DFD, ETP e TR.
        </p>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-main)", marginBottom: "10px" }}>Documentos de referência</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {campos.map((campo) => {
              const arquivo = arquivos[campo.chave];
              return (
                <label key={campo.chave} style={{ border: "1px solid var(--border)", borderRadius: "14px", padding: "14px", background: "var(--bg-subtle)", color: "var(--text-main)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "5px" }}>{campo.titulo}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.4, minHeight: "34px" }}>{campo.descricao}</div>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => definirArquivo(campo.chave, e.target.files?.[0] || null)}
                    style={{ width: "100%", marginTop: "10px", fontSize: "12px", color: "var(--text-main)" }}
                  />
                  {arquivo && <div style={{ marginTop: "7px", fontSize: "12px", fontWeight: 600, wordBreak: "break-word" }}>✓ {arquivo.name}</div>}
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: "10px", color: "var(--text-muted)", fontSize: "12px" }}>
            Formatos aceitos: PDF e DOCX. O arquivo original não é enviado à IA quando for um Edital/Aviso; apenas os anexos DFD/ETP/TR encontrados são encaminhados como contexto.
          </div>
        </div>

        <label style={{ display: "block", textAlign: "left", marginBottom: "18px", color: "var(--text-main)", fontSize: "14px", fontWeight: 600 }}>
          E-mail para recebimento
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailValido) handleConfirmar();
            }}
            placeholder="seuemail@exemplo.com"
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", marginTop: "8px", padding: "13px 14px", borderRadius: "12px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "14px" }}
          />
        </label>

        <label style={{ display: "block", textAlign: "left", marginBottom: "24px", color: "var(--text-main)", fontSize: "14px", fontWeight: 600 }}>
          Instruções adicionais para a IA
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva aqui regras específicas, pontos de atenção e referências importantes..."
            style={{ width: "100%", height: "180px", padding: "16px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "14px", resize: "none", boxSizing: "border-box", marginTop: "8px" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button onClick={handleCancelar} style={{ width: "110px", height: "40px", borderRadius: "10px", border: "2px solid var(--border)", background: "transparent", color: "var(--text-main)", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleConfirmar} disabled={!emailValido} style={{ width: "180px", height: "40px", borderRadius: "10px", border: "none", background: emailValido ? "var(--btn-primary)" : "var(--text-light)", color: "#ffffff", fontWeight: "bold", fontSize: "13px", cursor: emailValido ? "pointer" : "not-allowed" }}>Colocar na fila</button>
        </div>
      </div>
    </div>
  );
}
