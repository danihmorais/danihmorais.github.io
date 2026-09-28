const CHAVE_CONFIG_IA = "licita_ai:config_ia";
const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

export interface ConfigIA {
  provedor?: "backend" | "unsloth" | string;
  chave_api?: string;
  modelo?: string;
  configurada?: boolean;
}

const MODELO_PADRAO = "unsloth-auto";

export function lerConfigIA(): ConfigIA {
  try {
    const raw = localStorage.getItem(CHAVE_CONFIG_IA);
    const salvo = raw ? JSON.parse(raw) : {};
    const provedorSalvo = typeof salvo?.provedor === "string" ? salvo.provedor.trim().toLowerCase() : "";
    const provedor = provedorSalvo === "unsloth" ? "unsloth" : "backend";
    return {
      provedor,
      chave_api: "backend",
      modelo: salvo?.modelo === MODELO_PADRAO ? MODELO_PADRAO : MODELO_PADRAO,
      configurada: Boolean(salvo?.configurada),
    };
  } catch {
    return {
      provedor: "backend",
      chave_api: "backend",
      modelo: MODELO_PADRAO,
      configurada: false,
    };
  }
}

export function salvarConfigIA(config: ConfigIA): void {
  const provedor = config.provedor === "unsloth" ? "unsloth" : "backend";
  const modelo = config.modelo === MODELO_PADRAO ? MODELO_PADRAO : MODELO_PADRAO;
  localStorage.setItem(CHAVE_CONFIG_IA, JSON.stringify({
    provedor,
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
