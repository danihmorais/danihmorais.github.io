import React, { useState } from "react";

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (instrucoes: string) => void;
}

export default function PromptModal({ isOpen, onClose, onConfirm }: PromptModalProps) {
  const [texto, setTexto] = useState("");

  if (!isOpen) return null;

  const handleConfirmar = () => {
    onConfirm(texto.trim());
    setTexto("");
  };

  const handleCancelar = () => {
    onClose();
    setTexto("");
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "24px" }}>
      <div style={{ background: "var(--bg-panel)", width: "100%", maxWidth: "800px", borderRadius: "24px", padding: "32px", boxShadow: "var(--shadow-lg)" }}>
        
        <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", color: "var(--text-main)" }}>Instruções Adicionais para a IA</h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--text-muted)" }}>
          Precise melhor o foco para a geração. Adicione regras específicas, pontos de atenção e referências importantes.
        </p>

        <textarea 
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva aqui as suas instruções..."
          style={{ width: "100%", height: "200px", padding: "16px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "14px", resize: "none", boxSizing: "border-box", marginBottom: "24px" }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button 
            onClick={handleCancelar}
            style={{ width: "110px", height: "40px", borderRadius: "10px", border: "2px solid var(--border)", background: "transparent", color: "var(--text-main)", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirmar}
            style={{ width: "140px", height: "40px", borderRadius: "10px", border: "none", background: "var(--btn-primary)", color: "#ffffff", fontWeight: "bold", fontSize: "13px", cursor: "pointer" }}
          >
            Enviar e Gerar
          </button>
        </div>

      </div>
    </div>
  );
}