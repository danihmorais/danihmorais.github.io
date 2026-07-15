import React from "react";

export default function Step2({ dados, atualizarDados }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontSize: "16px", margin: "0 0 8px 0", color: "var(--text-main)" }}>
          Condições de Execução e Prazos <span style={{ color: "var(--btn-danger)" }}>*</span>
        </h2>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "13px" }}>Informe os principais requisitos de execução, prazos e medidas de controle de qualidade.</p>
      </div>

      <div style={{ display: "flex", gap: "32px", marginBottom: "8px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "15px", color: "var(--text-main)" }}>
          <input 
            type="checkbox" 
            checked={dados.amostra} 
            onChange={(e) => atualizarDados({ amostra: e.target.checked })} 
            style={{ width: "18px", height: "18px" }}
          />
          Exigir amostra
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "15px", color: "var(--text-main)" }}>
          <input 
            type="checkbox" 
            checked={dados.vistoria} 
            onChange={(e) => atualizarDados({ vistoria: e.target.checked })} 
            style={{ width: "18px", height: "18px" }}
          />
          Exigir vistoria
        </label>
      </div>

      <div>
        <textarea 
          required
          value={dados.execucao}
          onChange={(e) => atualizarDados({ execucao: e.target.value })}
          placeholder="Descreva aqui as regras de entrega, prazos, locais, garantias e demais condições..."
          style={{ padding: "16px", borderRadius: "var(--radius-lg)", borderColor: dados.execucao.trim() === "" ? "var(--btn-danger)" : "var(--input-border)", minHeight: "220px", resize: "vertical" }}
        />
        {dados.execucao.trim() === "" && <span style={{ color: "var(--btn-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>Este campo é obrigatório.</span>}
      </div>
    </div>
  );
}