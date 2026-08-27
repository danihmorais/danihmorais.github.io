// Configuração da IA é fornecida pelo build via GitHub Actions.
// As chaves ficam nos secrets API_UNSLOTH/API_OPENROUTER e são injetadas
// como variáveis VITE_* durante o build do Licita.AI.

const CHAVE_CONFIG_IA = "licita_ai:config_ia";
const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

const API_UNSLOTH = import.meta.env.VITE_API_UNSLOTH_KEY || "";
const API_OPENROUTER = import.meta.env.VITE_API_OPENROUTER_KEY || "";

export interface ConfigIA {
  provedor?: string;
  chave_api?: string;
  modelo?: string;
}

export function lerConfigIA(): ConfigIA {
  try {
    const raw = localStorage.getItem(CHAVE_CONFIG_IA);
    const salvo = raw ? JSON.parse(raw) : {};

    if (API_UNSLOTH) {
      return {
        provedor: "unsloth",
        chave_api: API_UNSLOTH,
        modelo: salvo.modelo || "unsloth-auto",
      };
    }

    if (API_OPENROUTER) {
      return {
        provedor: "openrouter",
        chave_api: API_OPENROUTER,
        modelo: salvo.modelo || "openrouter/free",
      };
    }

    return salvo;
  } catch {
    return API_UNSLOTH
      ? { provedor: "unsloth", chave_api: API_UNSLOTH, modelo: "unsloth-auto" }
      : API_OPENROUTER
        ? { provedor: "openrouter", chave_api: API_OPENROUTER, modelo: "openrouter/free" }
        : {};
  }
}

export function salvarConfigIA(config: ConfigIA): void {
  // Mantém apenas preferências não sensíveis. As chaves vêm dos secrets do build.
  localStorage.setItem(CHAVE_CONFIG_IA, JSON.stringify({
    provedor: config.provedor,
    modelo: config.modelo,
  }));
}

export function lerDadosUsuario(): Record<string, any> {
  try {
    const raw = localStorage.getItem(CHAVE_DADOS_USUARIO);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function salvarDadosUsuario(dados: Record<string, any>): void {
  localStorage.setItem(CHAVE_DADOS_USUARIO, JSON.stringify(dados));
}
