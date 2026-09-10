import React, { useState } from "react";

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dados: { instrucoes: string; email: string }) => void;
}

export default function PromptModal({ isOpen, onClose, onConfirm }: PromptModalProps) {
  const [texto, setTexto] = useState("");
  const [email, setEmail] = useState("");

  if (!isOpen) return null;

  const emailValido = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim());

  const handleConfirmar = () => {
    if (!emailValido) return;
    onConfirm({ instrucoes: texto.trim(), email: email.trim() });
    setTexto("");
  };

  const handleCancelar = () => {
    onClose();
    setTexto("");
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "24px" }}>
      <div style={{ background: "var(--bg-panel)", width: "100%", maxWidth: "800px", borderRadius: "24px", padding: "32px", boxShadow: "var(--shadow-lg)" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", color: "var(--text-main)" }}>Agendar geração da Fase Preparatória</h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--text-muted)" }}>
          O pedido será colocado na fila do backend. Os documentos serão gerados no servidor e enviados por e-mail quando o processamento terminar.
        </p>

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
          <button
            onClick={handleCancelar}
            style={{ width: "110px", height: "40px", borderRadius: "10px", border: "2px solid var(--border)", background: "transparent", color: "var(--text-main)", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!emailValido}
            style={{ width: "180px", height: "40px", borderRadius: "10px", border: "none", background: emailValido ? "var(--btn-primary)" : "var(--text-light)", color: "#ffffff", fontWeight: "bold", fontSize: "13px", cursor: emailValido ? "pointer" : "not-allowed" }}
          >
            Agendar e Gerar
          </button>
        </div>
      </div>
    </div>
  );
}