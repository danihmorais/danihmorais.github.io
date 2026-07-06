export const API_URL = import.meta.env.VITE_API_URL || "https://SEU_BACKEND_NO_RENDER.onrender.com";

export const apiFetch = async (endpoint: string, options?: RequestInit) => {
  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    throw new Error('Erro na requisição');
  }
  return response.json();
};