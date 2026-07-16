import { useState, useContext, useEffect } from "react";
import logo from "./assets/logo.png";
import { ThemeContext } from "./context/ThemeContext";
import Wizard from "./views/wizard";
import ConfigIA from "./components/configIA";
import { lerConfigIA } from "./utils/storageLocal";
import { validarChaveGemini, validarChaveOpenRouter } from "./providers/llm";

export default function App() {
  const [logado, setLogado] = useState(false);
  const [statusGemini, setStatusGemini] = useState<boolean | null>(null);
  const [statusOpenRouter, setStatusOpenRouter] = useState<boolean | null>(null);

  const { theme, toggleTheme } = useContext(ThemeContext);

  const isDark = theme === "dark";

  useEffect(() => {
    verificarApis();
    verificarSessao();

    const timer = setInterval(() => {
      verificarApis();
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const verificarSessao = () => {
    const config = lerConfigIA();
    if (config && config.chave_api) {
      setLogado(true);
    }
  };

  // Não existe mais um backend que guarde chaves mestras: cada usuário usa a
  // própria chave (Gemini ou OpenRouter), salva no navegador. Por isso aqui
  // apenas validamos, no cliente, se a chave configurada pelo usuário ainda
  // está ativa junto ao provedor escolhido.
  const verificarApis = async () => {
    const config = lerConfigIA();

    if (!config?.chave_api) {
      setStatusGemini(null);
      setStatusOpenRouter(null);
      return;
    }

    try {
      if (config.provedor === "openrouter") {
        const ok = await validarChaveOpenRouter(config.chave_api);
        setStatusOpenRouter(ok);
        setStatusGemini(null);
      } else {
        const ok = await validarChaveGemini(config.chave_api);
        setStatusGemini(ok);
        setStatusOpenRouter(null);
      }
    } catch {
      setStatusGemini(false);
      setStatusOpenRouter(false);
    }
  };

  const obterStatus = () => {
    if (statusGemini === null && statusOpenRouter === null) {
      return {
        texto: "Configure sua chave de API para começar",
        cor: "var(--text-muted)",
      };
    }

    if (statusGemini === true) {
      return {
        texto: "Conectado à API Gemini",
        cor: "var(--btn-success)",
      };
    }

    if (statusOpenRouter === true) {
      return {
        texto: "Conectado à API OpenRouter",
        cor: "var(--btn-success)",
      };
    }

    return {
      texto: "Falha na conexão com a API configurada. Verifique sua chave.",
      cor: "var(--btn-danger)",
    };
  };

  const status = obterStatus();

  if (logado) {
    return <Wizard />;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "var(--bg-base)",
        transition: "background-color 0.3s",
        fontFamily: "sans-serif",
      }}
    >
      <button
        onClick={() => (window.location.href = "/")}
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          padding: "8px 16px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          background: "var(--bg-subtle)",
          color: "var(--text-main)",
          fontWeight: 600,
        }}
      >
        ← Voltar
      </button>

      <button
        onClick={toggleTheme}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          padding: "8px 16px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          background: "var(--bg-subtle)",
          color: "var(--text-main)",
        }}
      >
        {isDark ? "☀️ Modo Claro" : "🌙 Modo Escuro"}
      </button>

      <div
        style={{
          background: "var(--bg-panel)",
          padding: "40px",
          borderRadius: "24px",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: "600px",
          textAlign: "center",
          transition: "background-color 0.3s",
        }}
      >
        <img
          src={logo}
          alt="Licita.AI Logo"
          style={{ width: "90px", marginBottom: "16px" }}
        />

        <h1
          style={{
            margin: "0 0 8px 0",
            fontSize: "34px",
            color: "var(--text-main)",
          }}
        >
          Licita.AI
        </h1>

        <p
          style={{
            color: "var(--text-muted)",
            marginBottom: "35px",
          }}
        >
          Automatize a criação de DFD, ETP e TR com Inteligência Artificial
        </p>

        <ConfigIA
          onSuccess={() => setLogado(true)}
          textoBotao="Acessar Sistema"
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "30px",
            fontSize: "12px",
            color: "var(--text-muted)",
          }}
        >
          <span
            style={{
              color: status.cor,
              fontWeight: "bold",
            }}
          >
            {status.texto}
          </span>

          <span>@danih.morais</span>
        </div>
      </div>
    </div>
  );
}