const API = (import.meta.env.VITE_BIBLIOTECA_API_URL || 'https://servidor.tail7d4aa4.ts.net/biblioteca-api').replace(/\/$/, '')

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init?.headers || {}) } })
  let body: unknown = null
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const detail = typeof body === 'object' && body && 'detail' in body ? String((body as { detail: unknown }).detail) : `Erro ${response.status}`
    throw new Error(detail)
  }
  return body as T
}

export function photoUrl(file?: string | null) { return file ? `${API}/api/fotos/${encodeURIComponent(file)}` : '' }
export { API }
