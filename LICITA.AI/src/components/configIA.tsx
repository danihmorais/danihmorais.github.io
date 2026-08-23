import React, { useState, useEffect } from "react";
import { validarChaveGemini, validarChaveOpenRouter, validarChaveNvidia, MODELOS_DISPONIVEIS, MODELO_PADRAO_POR_PROVEDOR } from "../providers/llm";
import { lerConfigIA, salvarConfigIA } from "../utils/storageLocal";

interface ConfigIAProps {
  onSuccess?: () => void;
  textoBotao?: string;
}

export default function ConfigIA({ onSuccess, textoBotao = "Acessar Sistema" }: ConfigIAProps) {
  const [provedor, setProvedor] = useState("gemini");
  const [chaveApi, setChaveApi] = useState("");
  const [modelo, setModelo] = useState(MODELO_PADRAO_POR_PROVEDOR["gemini"]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    console.log("Lendo configurações de IA salvas...");
    const config = lerConfigIA();
    console.log("Configurações carregadas no componente:", config);
    if (config && config.chave_api) {
      const provedorSalvo = config.provedor || "gemini";
      setProvedor(provedorSalvo);
      setChaveApi(config.chave_api);
      setModelo(config.modelo || MODELO_PADRAO_POR_PROVEDOR[provedorSalvo]);
    }
  }, []);

  // Ao trocar de provedor, seleciona o modelo padrão desse provedor
  const handleTrocarProvedor = (novoProvedor: string) => {
    setProvedor(novoProvedor);
    setModelo(MODELO_PADRAO_POR_PROVEDOR[novoProvedor]);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Iniciando processo de validação da chave. Provedor selecionado:", provedor);
    setCarregando(true);
    
    try {
      let valida = false;
      if (provedor === "gemini") {
        valida = await validarChaveGemini(chaveApi);
      } else if (provedor === "nvidia") {
        valida = await validarChaveNvidia(chaveApi);
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

      console.log("Validação aprovada. Salvando chave localmente...");
      salvarConfigIA({ provedor, chave_api: chaveApi, modelo });
      console.log("Chave salva com sucesso no navegador.");
      
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
    const urls: Record<string, string> = {
      openrouter: "https://openrouter.ai/settings/keys",
      nvidia: "https://build.nvidia.com/",
      gemini: "https://aistudio.google.com/app/apikey",
    };
    window.open(urls[provedor] || urls.gemini, "_blank", "noopener,noreferrer");
  };

  const modelosDoProvedor = MODELOS_DISPONIVEIS[provedor] || [];

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
            onChange={(e) => handleTrocarProvedor(e.target.value)} 
            style={{accentColor: "var(--btn-primary)", outline: "none", boxShadow: "none"}} 
          />
          Google Gemini
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input 
            type="radio" 
            value="openrouter" 
            checked={provedor === "openrouter"} 
            onChange={(e) => handleTrocarProvedor(e.target.value)} 
            style={{accentColor: "var(--btn-primary)", outline: "none", boxShadow: "none"}} 
          />
          OpenRouter
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input 
            type="radio" 
            value="nvidia" 
            checked={provedor === "nvidia"} 
            onChange={(e) => handleTrocarProvedor(e.target.value)} 
            style={{accentColor: "var(--btn-primary)", outline: "none", boxShadow: "none"}} 
          />
          NVIDIA
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

        <div style={{ textAlign: "left" }}>
          <label style={{ fontWeight: "bold", fontSize: "14px", color: "var(--text-main)", display: "block", marginBottom: "8px" }}>
            Modelo de IA
          </label>
          <select
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            style={{ width: "100%", padding: "14px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "14px", boxSizing: "border-box" }}
          >
            {modelosDoProvedor.map((opcao) => (
              <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Ou digite o identificador de outro modelo (opcional)"
            value={modelosDoProvedor.some((o) => o.value === modelo) ? "" : modelo}
            onChange={(e) => setModelo(e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: "14px", border: "1px solid var(--input-border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "13px", boxSizing: "border-box", marginTop: "8px" }}
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