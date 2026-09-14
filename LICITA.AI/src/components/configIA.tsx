import React, { useState, useEffect } from "react";
import { lerConfigIA, salvarConfigIA } from "../utils/storageLocal";
import { validarChaveUnsloth, validarChaveOpenRouter, MODELO_PADRAO_POR_PROVEDOR } from "../providers/llm";

interface ConfigIAProps { onSuccess?: () => void; textoBotao?: string; }

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [modelo, setModelo] = useState(MODELO_PADRAO_POR_PROVEDOR.openrouter);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("Validando o backend do Licita.AI...");

  useEffect(() => {
    const config = lerConfigIA();
    setModelo(config.modelo || MODELO_PADRAO_POR_PROVEDOR.openrouter);
    validar();
  }, []);

  const validar = async () => {
    setCarregando(true);
    setMensagem("Validando os provedores configurados no backend...");
    try {
      const unslothOk = await validarChaveUnsloth();
      if (unslothOk) {
        salvarConfigIA({ provedor: "openrouter", modelo: "unsloth-auto" });
        setModelo("unsloth-auto");
        setMensagem("Backend conectado. Unsloth disponível como provedor primário; OpenRouter é fallback automático.");
        onSuccess?.();
        return;
      }

      const openRouterOk = await validarChaveOpenRouter();
      if (openRouterOk) {
        setModelo(MODELO_PADRAO_POR_PROVEDOR.openrouter);
        salvarConfigIA({ provedor: "openrouter", modelo: MODELO_PADRAO_POR_PROVEDOR.openrouter });
        setMensagem("Backend conectado. OpenRouter disponível como provedor ativo.");
        onSuccess?.();
        return;
      }

      setMensagem("O backend respondeu, mas nenhum provedor de IA está disponível.");
    } catch (error) {
      console.error("Erro ao validar backend de IA:", error);
      setMensagem("Não foi possível conectar ao backend de IA.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: "16px", color: "var(--text-main)", marginBottom: "16px", textAlign: "center" }}>
        Motor de Inteligência Artificial
      </h3>
      <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", textAlign: "left" }}>
        <strong>Provedor:</strong> Backend do Licita.AI<br />
        <strong>Primário:</strong> Unsloth<br />
        <strong>Fallback:</strong> OpenRouter<br />
        <strong>Modelo:</strong> {modelo}
        <div style={{ marginTop: "10px", color: "var(--text-muted)", fontSize: "13px" }}>{mensagem}</div>
      </div>
      <button type="button" onClick={validar} disabled={carregando} style={{ width: "100%", marginTop: "24px", padding: "16px", backgroundColor: "var(--btn-primary)", color: "#ffffff", border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: "bold", cursor: carregando ? "not-allowed" : "pointer" }}>
        {carregando ? "Validando..." : textoBotao}
      </button>
    </div>
  );
}
