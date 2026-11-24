import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles.css";

const limparNumeracaoInicial = (texto: string): string => {
  return texto
    .split(/\r?\n/)
    .map((linha) => {
      if (!linha) return linha;
      const primeiroCaractereComLetra = linha.search(/\p{L}/u);
      return primeiroCaractereComLetra >= 0
        ? linha.slice(primeiroCaractereComLetra)
        : linha;
    })
    .join("\n");
};

document.addEventListener("paste", (event) => {
  const campo = event.target;
  if (!(campo instanceof HTMLTextAreaElement)) return;

  const placeholder = (campo.getAttribute("placeholder") || "").toLocaleLowerCase("pt-BR");
  const ehObrigacoes =
    placeholder.includes("cláusulas da contratante") ||
    placeholder.includes("cláusulas da contratada");

  if (!ehObrigacoes) return;

  const texto = event.clipboardData?.getData("text/plain");
  if (texto == null) return;

  const textoLimpo = limparNumeracaoInicial(texto);
  if (textoLimpo === texto) return;

  event.preventDefault();

  const inicio = campo.selectionStart ?? campo.value.length;
  const fim = campo.selectionEnd ?? campo.value.length;

  campo.setRangeText(textoLimpo, inicio, fim, "end");
  campo.dispatchEvent(new Event("input", { bubbles: true }));
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);