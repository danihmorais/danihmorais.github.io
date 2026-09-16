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

function normalizeIsbn(value: string) {
  return String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase()
}

function yearFrom(value: unknown) {
  const match = String(value || '').match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  return match ? Number(match[1]) : null
}

function buildIsbnResult(isbn: string, titulo: string, autor: string, editora: string, ano: number | null, idioma: string, descricao: string, fonte: string) {
  if (!titulo && !autor && !editora) return null
  return { isbn, titulo, autor, editora, ano, idioma: idioma || 'Português', descricao, fonte }
}

async function lookupIsbnFallback(value: string) {
  const isbn = normalizeIsbn(value)
  if (!/^\d{10}|\d{13}$/.test(isbn)) return null

  const requests = [
    async () => {
      const response = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=1`, { headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const payload: any = await response.json()
      const doc = payload?.docs?.[0]
      if (!doc) return null
      return buildIsbnResult(isbn, doc.title || '', Array.isArray(doc.author_name) ? doc.author_name.join(', ') : '', Array.isArray(doc.publisher) ? doc.publisher[0] || '' : '', yearFrom(doc.first_publish_year), 'Português', '', 'Open Library')
    },
    async () => {
      const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const payload: any = await response.json()
      const authors = Array.isArray(payload?.authors) ? payload.authors.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean).join(', ') : ''
      const publishers = Array.isArray(payload?.publishers) ? payload.publishers.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean).join(', ') : ''
      const notes = typeof payload?.notes === 'string' ? payload.notes : ''
      return buildIsbnResult(isbn, payload?.title || '', authors, publishers, yearFrom(payload?.publish_date), 'Português', notes, 'Open Library')
    },
    async () => {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=5`, { headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const payload: any = await response.json()
      for (const item of payload?.items || []) {
        const info = item?.volumeInfo || {}
        const result = buildIsbnResult(isbn, info.title || '', Array.isArray(info.authors) ? info.authors.join(', ') : '', info.publisher || '', yearFrom(info.publishedDate), info.language || 'Português', info.description || '', 'Google Books')
        if (result) return result
      }
      return null
    }
  ]

  for (const request of requests) {
    try {
      const result = await request()
      if (result) return result
    } catch {}
  }
  return null
}

async function resolveIsbnResponse(value: string, body: unknown, status: number) {
  const current = isObject(body) ? body : null
  const hasData = Boolean(current && (current.titulo || current.autor || current.editora))
  if (status >= 200 && status < 300 && hasData) return body
  const fallback = await lookupIsbnFallback(value)
  if (fallback) return fallback
  return null
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

  if (path.startsWith('/api/livros/buscar-isbn')) {
    const resolved = await resolveIsbnResponse(new URLSearchParams(path.split('?')[1] || '').get('codigo') || '', body, response.status)
    if (resolved) return resolved as T
  }

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