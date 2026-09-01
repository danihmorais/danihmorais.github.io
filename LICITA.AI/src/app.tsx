import { useState, useContext, useEffect } from "react";
import logo from "./assets/logo.png";
import { ThemeContext } from "./context/ThemeContext";
import Wizard from "./views/wizard";
import CompraDiretaWizard from "./views/CompraDiretaWizard";
import ConfigIA from "./components/configIA";
import { lerConfigIA } from "./utils/storageLocal";
import { validarChaveOpenRouter, validarChaveUnsloth } from "./providers/llm";

export default function App() {
  const [logado, setLogado] = useState(false);
  const [modo, setModo] = useState<"completa" | "compra_direta" | null>(null);
  const [statusIA, setStatusIA] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  useEffect(() => {
    verificarApis();
    verificarSessao();
    const timer = setInterval(verificarApis, 60000);
    return () => clearInterval(timer);
  }, []);

  const verificarSessao = () => {
    const config = lerConfigIA();
    if (config?.chave_api) setLogado(true);
  };

  const verificarApis = async () => {
    const config = lerConfigIA();
    if (!config?.chave_api) { setStatusIA(null); return; }
    try {
      const ok = config.provedor === "unsloth" ? await validarChaveUnsloth() : await validarChaveOpenRouter(config.chave_api);
      setStatusIA(ok);
    } catch { setStatusIA(false); }
  };

  const obterStatus = () => {
    if (statusIA === null) return { texto: "Configurando inteligência artificial...", cor: "var(--text-muted)" };
    if (statusIA) return { texto: "IA local Unsloth conectada — OpenRouter disponível como fallback", cor: "var(--btn-success)" };
    return { texto: "Falha na conexão com a IA configurada. O OpenRouter será usado quando disponível.", cor: "var(--btn-danger)" };
  };

  const status = obterStatus();

  if (logado && modo === "completa") return <Wizard />;
  if (logado && modo === "compra_direta") return <CompraDiretaWizard onVoltar={() => setModo(null)} />;

  if (logado) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-base)", padding: "40px", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: "920px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
            <div>
              <h1 style={{ margin: 0, color: "var(--text-main)", fontSize: "32px" }}>Licita.AI</h1>
              <p style={{ color: "var(--text-muted)", margin: "8px 0 0" }}>O que você deseja confeccionar?</p>
            </div>
            <button onClick={toggleTheme} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: "var(--bg-subtle)", color: "var(--text-main)" }}>{isDark ? "☀️" : "🌙"}</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            <button onClick={() => setModo("completa")} style={{ textAlign: "left", padding: "28px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-main)", boxShadow: "var(--shadow-md)", cursor: "pointer" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>📚</div>
              <h2 style={{ margin: "0 0 10px" }}>Fase preparatória completa</h2>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.5 }}>Gera DFD → ETP → TR em sequência, mantendo os documentos coerentes entre si.</p>
            </button>

            <button onClick={() => setModo("compra_direta")} style={{ textAlign: "left", padding: "28px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-main)", boxShadow: "var(--shadow-md)", cursor: "pointer" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>🧾</div>
              <h2 style={{ margin: "0 0 10px" }}>Compra direta — DFD detalhado</h2>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.5 }}>Para compras diretas e nota avulsa. Gera somente um DFD mais completo, com nível de detalhamento próximo ao de um TR.</p>
            </button>
          </div>

          <div style={{ marginTop: "28px", textAlign: "center", color: status.cor, fontSize: "12px", fontWeight: "bold" }}>{status.texto}</div>
          <div style={{ textAlign: "center", marginTop: "12px" }}><button onClick={() => setLogado(false)} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>Sair</button></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg-base)", transition: "background-color 0.3s", fontFamily: "sans-serif" }}>
      <button onClick={() => (window.location.href = "/")} style={{ position: "absolute", top: "20px", left: "20px", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--bg-subtle)", color: "var(--text-main)", fontWeight: 600 }}>← Voltar</button>
      <button onClick={toggleTheme} style={{ position: "absolute", top: "20px", right: "20px", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--bg-subtle)", color: "var(--text-main)" }}>{isDark ? "☀️ Modo Claro" : "🌙 Modo Escuro"}</button>
      <div style={{ background: "var(--bg-panel)", padding: "40px", borderRadius: "24px", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "600px", textAlign: "center", transition: "background-color 0.3s" }}>
        <img src={logo} alt="Licita.AI Logo" style={{ width: "90px", marginBottom: "16px" }} />
        <h1 style={{ margin: "0 0 8px 0", fontSize: "34px", color: "var(--text-main)" }}>Licita.AI</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "35px" }}>Automatize a criação de DFD, ETP e TR com Inteligência Artificial</p>
        <ConfigIA onSuccess={() => setLogado(true)} textoBotao="Acessar Sistema" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "30px", fontSize: "12px", color: "var(--text-muted)" }}>
          <span style={{ color: status.cor, fontWeight: "bold" }}>{status.texto}</span>
          <span>@danih.morais</span>
        </div>
      </div>
    </div>
  );
}
