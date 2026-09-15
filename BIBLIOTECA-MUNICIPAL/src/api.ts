const API = (import.meta.env.VITE_BIBLIOTECA_API_URL || 'https://servidor.tail7d4aa4.ts.net/biblioteca-api').replace(/\/$/, '')

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeResponse(path: string, body: unknown): unknown {
  if (body !== null) {
    if (path === '/api/dashboard' && isObject(body)) {
      const recentLoans = (Array.isArray(body.emprestimos_recentes) ? body.emprestimos_recentes : []).filter(isObject)
      const recentLogs = (Array.isArray(body.logs_recentes) ? body.logs_recentes : []).filter(isObject)
      return {
        ...body,
        emprestimos_recentes: recentLoans.map((item, index) => ({
          ...item,
          id: item.id ?? `${String(item.codigo ?? 'emprestimo')}-${index}`,
          pessoa_nome: item.pessoa_nome ?? item.pessoa ?? ''
        })),
        logs_recentes: recentLogs.map((item, index) => ({
          ...item,
          id: item.id ?? `${String(item.acao ?? 'log')}-${index}`
        }))
      }
    }
    return body
  }

  const listEndpoint = /^\/api\/(livros|pessoas|usuarios|emprestimos|logs)(?:\/|\?|$)/.test(path)
  if (listEndpoint) return []
  throw new Error('A API retornou uma resposta vazia.')
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {})
    }
  })
  let body: unknown = null
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const detail = typeof body === 'object' && body && 'detail' in body ? String((body as { detail: unknown }).detail) : `Erro ${response.status}`
    throw new Error(detail)
  }
  return normalizeResponse(path, body) as T
}

export function photoUrl(file?: string | null) {
  return file ? `${API}/api/fotos/${encodeURIComponent(file)}` : ''
}

export { API }
