interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export const API_URL = import.meta.env.VITE_API_URL || "https://danihmorais-github-io.onrender.com";

export const apiFetch = async (endpoint: string, options?: RequestInit) => {
  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    throw new Error('Erro na requisição');
  }
  return response.json();
};