(() => {
  const API = (window.__BIBLIOTECA_API_URL__ || 'https://servidor.tail7d4aa4.ts.net/biblioteca-api').replace(/\/$/, '')
  const originalFetch = window.fetch.bind(window)
  let books = []

  const token = () => localStorage.getItem('biblioteca_token') || ''

  async function request(path, init = {}) {
    const headers = new Headers(init.headers || {})
    if (!headers.has('Authorization') && token()) headers.set('Authorization', `Bearer ${token()}`)
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await originalFetch(`${API}${path}`, { ...init, headers })
    let body = null
    try { body = await response.clone().json() } catch {}
    if (!response.ok) throw new Error(body?.detail || `Erro ${response.status}`)
    return body
  }

  async function setCode(exemplarId, currentCode) {
    while (true) {
      const code = window.prompt('Código deste exemplar:', currentCode || '')
      if (code === null) return false
      const value = code.trim()
      if (!value) {
        window.alert('Informe o código do exemplar.')
        continue
      }
      try {
        await request(`/api/exemplares/${exemplarId}/codigo`, { method: 'PUT', body: JSON.stringify({ codigo: value }) })
        return true
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o código.')
      }
    }
  }

  async function assignCodes(exemplares) {
    for (const exemplar of exemplares || []) {
      await setCode(exemplar.id, exemplar.codigo)
    }
  }

  window.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init)
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = String(init.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()

    if (method === 'GET' && /\/api\/livros(?:\?|$)/.test(url)) {
      try {
        const body = await response.clone().json()
        if (Array.isArray(body)) books = body
      } catch {}
    }

    if (method === 'POST' && /\/api\/livros$/.test(url)) {
      try {
        const body = await response.clone().json()
        if (body?.id) {
          setTimeout(async () => {
            try {
              const list = await request(`/api/livros/${body.id}/exemplares`)
              if (list?.length) await setCode(list[0].id, '')
              window.dispatchEvent(new Event('biblioteca-exemplar-code-updated'))
            } catch {}
          }, 0)
        }
      } catch {}
    }

    if (method === 'POST' && /\/api\/livros\/\d+\/exemplares$/.test(url)) {
      try {
        const body = await response.clone().json()
        setTimeout(async () => {
          try {
            await assignCodes(body?.exemplares || [])
            window.dispatchEvent(new Event('biblioteca-exemplar-code-updated'))
          } catch {}
        }, 0)
      } catch {}
    }

    return response
  }

  function closeOverlay() {
    document.querySelectorAll('.exemplar-admin-overlay').forEach(x => x.remove())
  }

  async function openExemplares(book) {
    closeOverlay()
    const overlay = document.createElement('div')
    overlay.className = 'exemplar-admin-overlay'
    overlay.innerHTML = `<div class="exemplar-admin-modal"><header><h2>Exemplares — ${escapeHtml(book.titulo)}</h2><button type="button" data-close>×</button></header><p><strong>${escapeHtml(book.codigo)}</strong></p><div class="exemplar-admin-list">Carregando...</div><form><input required maxlength="80" placeholder="Código do novo exemplar"><button class="primary" type="submit">Adicionar exemplar</button></form></div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeOverlay() })
    overlay.querySelector('[data-close]').addEventListener('click', closeOverlay)
    const listEl = overlay.querySelector('.exemplar-admin-list')

    async function refresh() {
      const list = await request(`/api/livros/${book.id}/exemplares`)
      listEl.innerHTML = ''
      if (!list.length) {
        listEl.innerHTML = '<div class="exemplar-admin-empty">Nenhum exemplar cadastrado.</div>'
        return
      }
      for (const x of list) {
        const row = document.createElement('div')
        row.className = 'exemplar-admin-row'
        row.innerHTML = `<div><strong>${escapeHtml(x.codigo)}</strong><small>${escapeHtml(x.status || '')}${x.pessoa_nome ? ' · ' + escapeHtml(x.pessoa_nome) : ''}</small></div><div><button type="button" data-edit>Alterar código</button>${x.status !== 'Emprestado' ? '<button type="button" data-inactivate>Inativar</button>' : ''}</div>`
        row.querySelector('[data-edit]').addEventListener('click', async () => { if (await setCode(x.id, x.codigo)) refresh() })
        const inactivate = row.querySelector('[data-inactivate]')
        if (inactivate) inactivate.addEventListener('click', async () => {
          if (!window.confirm(`Inativar o exemplar ${x.codigo}?`)) return
          try { await request(`/api/exemplares/${x.id}/inativar`, { method: 'POST' }); await refresh() } catch (error) { window.alert(error instanceof Error ? error.message : 'Não foi possível inativar o exemplar.') }
        })
        listEl.appendChild(row)
      }
    }

    overlay.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault()
      const input = overlay.querySelector('input')
      const codigo = input.value.trim()
      if (!codigo) return
      try {
        const body = await request(`/api/livros/${book.id}/exemplares`, { method: 'POST', body: JSON.stringify({ quantidade: 1 }) })
        const created = body?.exemplares?.[0]
        if (!created) throw new Error('Não foi possível criar o exemplar.')
        if (await setCode(created.id, codigo)) {
          input.value = ''
          await refresh()
          window.dispatchEvent(new Event('biblioteca-exemplar-code-updated'))
        }
      } catch (error) { window.alert(error instanceof Error ? error.message : 'Não foi possível adicionar o exemplar.') }
    })

    await refresh()
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }

  function enhanceRows() {
    document.querySelectorAll('.bookrow').forEach(row => {
      if (row.querySelector('[data-exemplar-admin]')) return
      const title = row.querySelector('.bookinfo b')?.textContent?.trim()
      const book = books.find(x => x.titulo === title)
      if (!book) return
      const actions = row.querySelector('.actions')
      if (!actions) return
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Exemplares'
      button.dataset.exemplarAdmin = '1'
      button.addEventListener('click', () => openExemplares(book))
      actions.prepend(button)
    })
  }

  const style = document.createElement('style')
  style.textContent = `.exemplar-admin-overlay{position:fixed;inset:0;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:18px;z-index:99999}.exemplar-admin-modal{background:#fff;width:min(760px,100%);max-height:92vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);color:#173225}.exemplar-admin-modal header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.exemplar-admin-modal h2{margin:0}.exemplar-admin-modal form{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:16px}.exemplar-admin-modal input{width:100%;border:1px solid #ccd7d0;border-radius:10px;padding:11px 12px}.exemplar-admin-list{display:grid;gap:9px;margin-top:14px}.exemplar-admin-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e0e7e2;border-radius:12px}.exemplar-admin-row small{display:block;color:#68756e;margin-top:3px}.exemplar-admin-row>div:last-child{display:flex;gap:6px}.exemplar-admin-empty{padding:24px;text-align:center;color:#68756e;border:1px dashed #cbd7cf;border-radius:12px}@media(max-width:600px){.exemplar-admin-modal{padding:16px}.exemplar-admin-row{align-items:flex-start;flex-direction:column}.exemplar-admin-modal form{grid-template-columns:1fr}.exemplar-admin-row>div:last-child{width:100%}.exemplar-admin-row button{flex:1}}`
  document.head.appendChild(style)
  new MutationObserver(enhanceRows).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('biblioteca-exemplar-code-updated', enhanceRows)
  setInterval(enhanceRows, 800)
})()
