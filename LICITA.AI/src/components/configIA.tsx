import React, { useEffect, useState } from "react";
import { lerConfigIA, salvarConfigIA } from "../utils/storageLocal";
import { MODELOS_DISPONIVEIS, obterStatusBackendIA } from "../providers/llm";

interface ConfigIAProps {
  onSuccess?: () => void;
  textoBotao?: string;
}

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [modelo, setModelo] = useState("unsloth-auto");
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("Verificando o backend do Licita.AI...");
  const [status, setStatus] = useState({ ok: false, unsloth: false, openrouter: false });

  useEffect(() => {
    const config = lerConfigIA();
    setModelo(config.modelo || "unsloth-auto");
    void validar();
  }, []);

  const validar = async () => {
    setCarregando(true);
    setMensagem("Verificando os provedores configurados no backend...");
    const resultado = await obterStatusBackendIA();
    setStatus(resultado);

    if (!resultado.ok) {
      setMensagem("O backend respondeu, mas nenhuma credencial de IA está configurada.");
      setCarregando(false);
      return;
    }

    if (resultado.unsloth) {
      setMensagem(
        resultado.openrouter
          ? "Backend conectado. Unsloth local está disponível como provedor primário e OpenRouter como fallback."
          : "Backend conectado. Unsloth local está disponível. O OpenRouter não está configurado."
      );
      setCarregando(false);
      return;
    }

    if (resultado.openrouter) {
      setMensagem("Backend conectado. Apenas o OpenRouter está disponível como provedor remoto.");
      setCarregando(false);
      return;
    }

    setMensagem("O backend respondeu, mas nenhum provedor de IA está disponível.");
    setCarregando(false);
  };

  const salvar = () => {
    salvarConfigIA({ provedor: "openrouter", modelo });
    if (status.ok && textoBotao === "Acessar Sistema") onSuccess?.();
  };

  const opcoesModelo = MODELOS_DISPONIVEIS.backend;

  return (
    <div>
      <h3 style={{ fontSize: "16px", color: "var(--text-main)", marginBottom: "16px", textAlign: "center" }}>
        Motor de Inteligência Artificial
      </h3>
      <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", textAlign: "left" }}>
        <div><strong>Arquitetura:</strong> Backend do Licita.AI</div>
        <div style={{ marginTop: "8px" }}><strong>Primário:</strong> {status.unsloth ? "Unsloth local" : "Não disponível"}</div>
        <div style={{ marginTop: "8px" }}><strong>Fallback:</strong> {status.openrouter ? "OpenRouter" : "Não disponível"}</div>
        <div style={{ marginTop: "14px" }}>
          <label htmlFor="licita-modelo"><strong>Modelo:</strong></label>
          <select
            id="licita-modelo"
            value={modelo}
            onChange={(event) => setModelo(event.target.value)}
            disabled={carregando}
            style={{ width: "100%", marginTop: "8px", padding: "11px 12px", borderRadius: "10px", border: "1px solid var(--input-border)", background: "var(--bg-panel)", color: "var(--text-main)", fontSize: "14px" }}
          >
            {opcoesModelo.map((opcao) => (
              <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: "12px", color: status.ok ? "var(--btn-success)" : "var(--btn-danger)", fontSize: "13px" }}>
          {mensagem}
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
        <button
          type="button"
          onClick={() => void validar()}
          disabled={carregando}
          style={{ flex: 1, padding: "14px", backgroundColor: "var(--bg-subtle)", color: "var(--text-main)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "14px", fontWeight: "bold", cursor: carregando ? "not-allowed" : "pointer" }}
        >
          {carregando ? "Verificando..." : "Atualizar status"}
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={carregando || !status.ok}
          style={{ flex: 1, padding: "14px", backgroundColor: "var(--btn-primary)", color: "#ffffff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: "bold", cursor: carregando || !status.ok ? "not-allowed" : "pointer", opacity: carregando || !status.ok ? 0.6 : 1 }}
        >
          {textoBotao}
        </button>
      </div>
    </div>
  );
}
