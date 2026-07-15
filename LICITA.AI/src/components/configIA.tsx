import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { validarChaveGemini, validarChaveOpenRouter } from "../providers/llm";

interface ConfigIAProps {
  onSuccess?: () => void;
  textoBotao?: string;
}

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [provedor, setProvedor] = useState("gemini");
  const [chaveApi, setChaveApi] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    console.log("Lendo configurações de IA salvas...");
    invoke("ler_config_ia").then((config: any) => {
      console.log("Configurações carregadas no componente:", config);
      if (config && config.chave_api) {
        setProvedor(config.provedor || "gemini");
        setChaveApi(config.chave_api);
      }
    }).catch((err) => {
      console.error("Erro ao invocar ler_config_ia no frontend:", err);
    });
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Iniciando processo de validação da chave. Provedor selecionado:", provedor);
    setCarregando(true);
    
    try {
      let valida = false;
      if (provedor === "gemini") {
        valida = await validarChaveGemini(chaveApi);
      } else {
        valida = await validarChaveOpenRouter(chaveApi);
      }

      console.log("Retorno da função de validação (booleano):", valida);

      if (!valida) {
        console.warn("Validação retornou falso. Bloqueando o avanço.");
        alert("Chave de API inválida, sem saldo ou sem comunicação. Verifique o console (F12) para os detalhes do erro.");
        setCarregando(false);
        return;
      }

      console.log("Validação aprovada. Salvando chave via Tauri...");
      await invoke("salvar_config_ia", { provedor, chave: chaveApi });
      console.log("Chave salva com sucesso no backend.");
      
      if (textoBotao !== "Acessar Sistema") {
        alert("Configurações atualizadas com sucesso!");
      }
      
      if (onSuccess) {
        console.log("Acionando callback onSuccess...");
        onSuccess();
      }
    } catch (error) {
      console.error("Erro inesperado no try/catch do componente ConfigIA:", error);
      alert("Erro crítico ao tentar validar a chave de API.");
    } finally {
      setCarregando(false);
      console.log("Processo de carregamento do botão finalizado.");
    }
  };

  const abrirAjuda = () => {
    const url = provedor === "openrouter" 
      ? "https://openrouter.ai/settings/keys" 
      : "https://aistudio.google.com/app/apikey";
    invoke("abrir_link", { url }).catch(e => console.error("Erro ao tentar abrir o navegador externo:", e)); 
  };

  return (
    <div>
      <h3 style={{ fontSize: "16px", color: "var(--text-main)", marginBottom: "16px", textAlign: "center" }}>
        Selecione o motor de Inteligência Artificial
      </h3>
      <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginBottom: "35px", color: "var(--text-main)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input 
            type="radio" 
            value="gemini" 
            checked={provedor === "gemini"} 
            onChange={(e) => setProvedor(e.target.value)} 
            style={{accentColor: "var(--btn-primary)", outline: "none", boxShadow: "none"}} 
          />
          Google Gemini
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input 
            type="radio" 
            value="openrouter" 
            checked={provedor === "openrouter"} 
            onChange={(e) => setProvedor(e.target.value)} 
            style={{accentColor: "var(--btn-primary)", outline: "none", boxShadow: "none"}} 
          />
          OpenRouter
        </label>
      </div>

      <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ textAlign: "left" }}>
          <label style={{ fontWeight: "bold", fontSize: "14px", color: "var(--text-main)", display: "block", marginBottom: "8px" }}>
            Chave de API
          </label>
          <input 
            type="password" 
            placeholder="Cole sua chave de API aqui" 
            value={chaveApi}
            onChange={(e) => setChaveApi(e.target.value)}
            required
            style={{ width: "100%", padding: "14px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>
        
        <button type="button" onClick={abrirAjuda} style={{ background: "none", border: "none", color: "var(--btn-primary)", cursor: "pointer", fontSize: "13px", textAlign: "left", padding: 0 }}>
          Não tem uma chave? Saiba como obter gratuitamente.
        </button>

        <button type="submit" disabled={carregando} style={{ marginTop: "24px", padding: "16px", backgroundColor: "var(--btn-primary)", color: "#ffffff", border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: "bold", cursor: carregando ? "not-allowed" : "pointer" }}>
          {carregando ? "Validando..." : textoBotao}
        </button>
      </form>
    </div>
  );
}