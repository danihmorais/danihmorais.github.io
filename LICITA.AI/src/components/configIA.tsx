import React, { useState, useEffect } from "react";
import { lerConfigIA, salvarConfigIA } from "../utils/storageLocal";
import { validarChaveUnsloth, validarChaveOpenRouter, MODELO_PADRAO_POR_PROVEDOR } from "../providers/llm";

interface ConfigIAProps { onSuccess?: () => void; textoBotao?: string; }

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [provedor, setProvedor] = useState("unsloth");
  const [modelo, setModelo] = useState(MODELO_PADRAO_POR_PROVEDOR.unsloth);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("Inicializando IA local...");

  useEffect(() => {
    const config = lerConfigIA();
    setProvedor(config.provedor || "unsloth");
    setModelo(config.modelo || MODELO_PADRAO_POR_PROVEDOR[config.provedor || "unsloth"]);
    validar();
  }, []);

  const validar = async () => {
    setCarregando(true);
    setMensagem("Validando conexão com a IA local...");
    try {
      const unslothOk = await validarChaveUnsloth();
      if (unslothOk) {
        setProvedor("unsloth");
        salvarConfigIA({ provedor: "unsloth", modelo: "unsloth-auto" });
        setMensagem("IA local Unsloth conectada. OpenRouter será usado automaticamente se necessário.");
        onSuccess?.();
        return;
      }

      const openRouterOk = await validarChaveOpenRouter();
      if (openRouterOk) {
        setProvedor("openrouter");
        setModelo(MODELO_PADRAO_POR_PROVEDOR.openrouter);
        salvarConfigIA({ provedor: "openrouter", modelo: MODELO_PADRAO_POR_PROVEDOR.openrouter });
        setMensagem("Unsloth indisponível. OpenRouter conectado como fallback.");
        onSuccess?.();
        return;
      }

      setMensagem("Não foi possível conectar à IA local nem ao OpenRouter.");
    } catch (error) {
      console.error("Erro ao validar APIs de IA:", error);
      setMensagem("Erro ao conectar às APIs de IA.");
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
        <strong>Provedor principal:</strong> Unsloth (IA local)<br />
        <strong>Fallback:</strong> OpenRouter<br />
        <strong>Modelo:</strong> {provedor === "unsloth" ? "Modelo local automático" : modelo}
        <div style={{ marginTop: "10px", color: "var(--text-muted)", fontSize: "13px" }}>{mensagem}</div>
      </div>
      <button type="button" onClick={validar} disabled={carregando} style={{ width: "100%", marginTop: "24px", padding: "16px", backgroundColor: "var(--btn-primary)", color: "#ffffff", border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: "bold", cursor: carregando ? "not-allowed" : "pointer" }}>
        {carregando ? "Validando..." : textoBotao}
      </button>
    </div>
  );
}
