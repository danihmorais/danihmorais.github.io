const API = (import.meta.env.VITE_BIBLIOTECA_API_URL || 'https://servidor.tail7d4aa4.ts.net/biblioteca-api').replace(/\/$/, '')

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function token() {
  return localStorage.getItem('biblioteca_token') || ''
}

function requiresAuthentication(path: string) {
  return path !== '/api/auth/status' && path !== '/api/auth/login' && path !== '/health'
}

function normalizeResponse(path: string, body: unknown): unknown {
  if (body !== null) {
    if (path === '/api/dashboard' && isObject(body)) {
      const recentLoans = (Array.isArray(body.emprestimos_recentes) ? body.emprestimos_recentes : []).filter(isObject)
      const recentLogs = (Array.isArray(body.logs_recentes) ? body.logs_recentes : []).filter(isObject)
      return {
        livros: Number(body.livros ?? 0),
        titulos: Number(body.titulos ?? 0),
        pessoas: Number(body.pessoas ?? 0),
        emprestados: Number(body.emprestados ?? 0),
        atrasados: Number(body.atrasados ?? 0),
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
  if (path === '/api/dashboard') return { livros: 0, titulos: 0, pessoas: 0, emprestados: 0, atrasados: 0, emprestimos_recentes: [], logs_recentes: [] }
  const listEndpoint = /^\/api\/(livros|pessoas|usuarios|emprestimos|logs)(?:\/|\?|$)/.test(path)
  if (listEndpoint) return []
  throw new Error('A API retornou uma resposta vazia.')
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = token()
  if (requiresAuthentication(path) && !accessToken) {
    throw new Error('Autenticação necessária.')
  }
  const headers = new Headers(init?.headers || {})
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API}${path}`, { ...init, headers })
  let body: unknown = null
  try { body = await response.json() } catch { body = null }
  if (response.status === 401) {
    localStorage.removeItem('biblioteca_token')
    localStorage.removeItem('biblioteca_user')
    window.dispatchEvent(new Event('biblioteca-auth-expired'))
  }
  if (!response.ok) {
    const detail = isObject(body) && 'detail' in body ? String(body.detail) : `Erro ${response.status}`
    throw new Error(detail)
  }
  return normalizeResponse(path, body) as T
}

export function photoUrl(file?: string | null) {
  return file ? `${API}/api/fotos/${encodeURIComponent(file)}` : ''
}

export { API }
