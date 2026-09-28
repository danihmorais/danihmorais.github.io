import React, { useEffect, useState } from "react";
import { lerConfigIA, salvarConfigIA } from "../utils/storageLocal";
import { MODELOS_DISPONIVEIS, obterStatusBackendIA } from "../providers/llm";

interface ConfigIAProps { onSuccess?: () => void; textoBotao?: string; }

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [modelo, setModelo] = useState("unsloth-auto");
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("Verificando o backend do Licita.AI...");
  const [status, setStatus] = useState({ ok: false, unsloth: false });

  useEffect(() => {
    const config = lerConfigIA();
    setModelo(config.modelo || "unsloth-auto");
    void validar();
  }, []);

  const validar = async () => {
    setCarregando(true);
    setMensagem("Verificando o backend do Licita.AI...");
    const resultado = await obterStatusBackendIA();
    setStatus(resultado);
    if (!resultado.ok || !resultado.unsloth) {
      setMensagem("O backend respondeu, mas o Unsloth local não está disponível.");
      setModelo("unsloth-auto");
      setCarregando(false);
      return;
    }
    setModelo((atual) => atual || "unsloth-auto");
    setMensagem("Backend conectado. Unsloth local disponível.");
    setCarregando(false);
  };

  const salvar = () => {
    salvarConfigIA({ provedor: "unsloth", modelo });
    if (status.ok && status.unsloth && textoBotao === "Acessar Sistema") onSuccess?.();
  };

  return (
    <div>
      <h3 style={{ fontSize: "16px", color: "var(--text-main)", marginBottom: "16px", textAlign: "center" }}>Motor de Inteligência Artificial</h3>
      <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", textAlign: "left" }}>
        <div><strong>Arquitetura:</strong> Backend do Licita.AI</div>
        <div style={{ marginTop: "8px" }}><strong>Motor:</strong> Unsloth local</div>
        <div style={{ marginTop: "8px" }}><strong>Status:</strong> {status.unsloth ? "Disponível" : "Indisponível"}</div>
        <div style={{ marginTop: "14px" }}>
          <label htmlFor="licita-modelo"><strong>Modelo:</strong></label>
          <select id="licita-modelo" value={modelo} onChange={(event) => setModelo(event.target.value)} disabled={carregando}
            style={{ width: "100%", marginTop: "8px", padding: "11px 12px", borderRadius: "10px", border: "1px solid var(--input-border)", background: "var(--bg-panel)", color: "var(--text-main)", fontSize: "14px" }}>
            <option value="unsloth-auto">Unsloth local (automático)</option>
          </select>
        </div>
        <div style={{ marginTop: "12px", color: status.ok && status.unsloth ? "var(--btn-success)" : "var(--btn-danger)", fontSize: "13px" }}>{mensagem}</div>
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
        <button type="button" onClick={() => void validar()} disabled={carregando}
          style={{ flex: 1, padding: "14px", backgroundColor: "var(--bg-subtle)", color: "var(--text-main)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "14px", fontWeight: "bold", cursor: carregando ? "not-allowed" : "pointer" }}>{carregando ? "Verificando..." : "Atualizar status"}</button>
        <button type="button" onClick={salvar} disabled={carregando || !status.ok || !status.unsloth}
          style={{ flex: 1, padding: "14px", backgroundColor: "var(--btn-primary)", color: "#ffffff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: "bold", cursor: carregando || !status.ok || !status.unsloth ? "not-allowed" : "pointer", opacity: carregando || !status.ok || !status.unsloth ? 0.6 : 1 }}>{textoBotao}</button>
      </div>
    </div>
  );
}
