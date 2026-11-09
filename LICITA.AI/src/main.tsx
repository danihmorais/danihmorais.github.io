import React from "react";
import ReactDOM from "react-dom/client";

import App from "./app";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./components/toast";
import "./styles.css";

// Impede que uma posição de rolagem antiga seja restaurada ao abrir a aplicação.
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
const resetarRolagemInicial = () => window.scrollTo(0, 0);
window.addEventListener("pageshow", resetarRolagemInicial);
resetarRolagemInicial();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);