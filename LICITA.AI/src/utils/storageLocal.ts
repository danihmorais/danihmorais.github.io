// Substitui os antigos comandos Tauri "ler_config_ia" / "salvar_config_ia" /
// "ler_dados_usuario" / "salvar_dados_usuario", que persistiam dados num
// arquivo local via Rust. Agora que o app roda no navegador (GitHub Pages +
// FastAPI), esses dados (chave de API do usuário, contatos/gestores/fiscais
// salvos) são preferências puramente client-side, então usamos localStorage.

const CHAVE_CONFIG_IA = "licita_ai:config_ia";
const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

export interface ConfigIA {
  provedor?: string;
  chave_api?: string;
}

export function lerConfigIA(): ConfigIA {
  try {
    const raw = localStorage.getItem(CHAVE_CONFIG_IA);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function salvarConfigIA(config: ConfigIA): void {
  localStorage.setItem(CHAVE_CONFIG_IA, JSON.stringify(config));
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