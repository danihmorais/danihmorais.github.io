const CHAVE_CONFIG_IA = "licita_ai:config_ia";
const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

export interface ConfigIA {
  provedor?: string;
  chave_api?: string;
  modelo?: string;
}

const BACKEND_MARKER = "backend";

export function lerConfigIA(): ConfigIA {
  try {
    const raw = localStorage.getItem(CHAVE_CONFIG_IA);
    const salvo = raw ? JSON.parse(raw) : {};
    return {
      provedor: "openrouter",
      chave_api: BACKEND_MARKER,
      modelo: salvo.modelo || "openrouter/free",
    };
  } catch {
    return {
      provedor: "openrouter",
      chave_api: BACKEND_MARKER,
      modelo: "openrouter/free",
    };
  }
}

export function salvarConfigIA(config: ConfigIA): void {
  localStorage.setItem(CHAVE_CONFIG_IA, JSON.stringify({
    provedor: "openrouter",
    modelo: config.modelo || "openrouter/free",
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
