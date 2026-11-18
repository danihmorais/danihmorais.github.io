const storageGet = (key: string): string | null => {
  try {
    return window.storageGet(key);
  } catch {
    return null;
  }
};

const storageSet = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      try {
        window.dispatchEvent(new CustomEvent("licita-ai-storage-quota"));
      } catch {}
      return false;
    }
    return false;
  }
};

const storageRemove = (key: string): void => {
  try {
    window.storageRemove(key);
  } catch {}
};

const CHAVE_DADOS_USUARIO = "licita_ai:dados_usuario";

export function lerDadosUsuario(): Record<string, any> {
  try {
    const raw = storageGet(CHAVE_DADOS_USUARIO);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function salvarDadosUsuario(dados: Record<string, any>): void {
  storageSet(CHAVE_DADOS_USUARIO, JSON.stringify(dados));
}
