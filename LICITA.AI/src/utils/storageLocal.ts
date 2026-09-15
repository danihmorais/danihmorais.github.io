const CHAVE_CONFIG_IA = "licita_ai:config_ia";
const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

export interface ConfigIA {
  provedor?: "backend" | "openrouter" | string;
  chave_api?: string;
  modelo?: string;
  configurada?: boolean;
}

const MODELO_PADRAO = "unsloth-auto";

export function lerConfigIA(): ConfigIA {
  try {
    const raw = localStorage.getItem(CHAVE_CONFIG_IA);
    const salvo = raw ? JSON.parse(raw) : {};
    return {
      provedor: "openrouter",
      chave_api: "backend",
      modelo: typeof salvo?.modelo === "string" && salvo.modelo.trim() ? salvo.modelo : MODELO_PADRAO,
      configurada: Boolean(salvo?.configurada),
    };
  } catch {
    return {
      provedor: "openrouter",
      chave_api: "backend",
      modelo: MODELO_PADRAO,
      configurada: false,
    };
  }
}

export function salvarConfigIA(config: ConfigIA): void {
  const modelo = typeof config.modelo === "string" && config.modelo.trim() ? config.modelo.trim() : MODELO_PADRAO;
  localStorage.setItem(CHAVE_CONFIG_IA, JSON.stringify({
    provedor: "openrouter",
    modelo,
    configurada: true,
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
