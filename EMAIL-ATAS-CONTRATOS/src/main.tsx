import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const DEFAULT_SUBJECT = 'INSTRUMENTO CONTRATUAL (SÃO FRANCISCO - SP)'
const DEFAULT_BODY_HTML = `<p>Prezados,</p><p>Anexo instrumento contratual para assinatura.</p><p><strong>Prazo: 02 (dois) dias úteis</strong></p><p>Atenciosamente,</p><p>Setor de Licitações e Contratos de São Francisco - SP.</p>`
const API_URL = import.meta.env.VITE_API_URL || 'https://danihmorais-github-io.onrender.com/email/api'
const SETTINGS_STORAGE_KEY = 'enviador-atas-contratos.smtp-settings'

type Security = 'starttls' | 'ssl' | 'none'
type SmtpSettings = { host: string; port: number; username: string; password: string; security: Security; save_locally: boolean }
type Document = { file: File; recipient: string; error?: string }

const blankSettings: SmtpSettings = { host: '', port: 587, username: '', password: '', security: 'starttls', save_locally: false }

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [settings, setSettings] = useState<SmtpSettings>(blankSettings)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY_HTML)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (saved) setSettings({ ...blankSettings, ...JSON.parse(saved) })
    } catch { localStorage.removeItem(SETTINGS_STORAGE_KEY) }
  }, [])

  const updateSettings = <K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) => setSettings(s => ({ ...s, [key]: value }))

  function formatEmail(command: 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList') {
    editorRef.current?.focus()
    document.execCommand(command)
    setBodyHtml(editorRef.current?.innerHTML || '')
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const valid = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.pdf'))
    if (!valid.length) return setNotice('Selecione arquivos no formato PDF.')
    setLoading(true); setNotice('Lendo os e-mails institucionais nos PDFs…')
    const form = new FormData(); valid.forEach(file => form.append('files', file))
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    try {
      const response = await fetch(`${API_URL}/extract-recipients`, { method: 'POST', body: form, signal: controller.signal })
      if (!response.ok) throw new Error(`Servidor respondeu ${response.status}.`)
      const results: { filename: string; recipient: string | null; error?: string }[] = await response.json()
      const newDocs = valid.map((file, index) => ({ file, recipient: results[index]?.recipient || '', error: results[index]?.error || (!results[index]?.recipient ? 'Segundo “E-mail institucional” não localizado.' : undefined) }))
      setDocuments(old => [...old, ...newDocs]); setNotice('Revise os destinatários antes de enviar.')
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === 'AbortError'
        ? 'O servidor demorou demais para responder (pode estar "acordando" no Render — tente novamente em instantes).'
        : 'Não foi possível analisar os documentos. Verifique se o backend está em execução.')
    } finally { clearTimeout(timeoutId); setLoading(false); if (inputRef.current) inputRef.current.value = '' }
  }

  async function saveConfiguration() {
    try {
      const savedSettings = { ...settings, save_locally: true }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedSettings))
      setSettings(savedSettings)
      setNotice('Configurações salvas somente neste navegador.')
    } catch { setNotice('Não foi possível acessar o armazenamento local do navegador.') }
  }

  async function send() {
    if (!documents.length) return setNotice('Adicione pelo menos um PDF.')
    if (!settings.host || !settings.username) return setNotice('Preencha o servidor SMTP e o e-mail remetente.')
    if (documents.some(d => !d.recipient)) return setNotice('Informe ou corrija todos os destinatários antes de enviar.')
    setLoading(true); setNotice('Enviando os e-mails individualmente…')
    const form = new FormData()
    documents.forEach(d => form.append('files', d.file))
    form.append('recipients', JSON.stringify(documents.map(d => d.recipient.trim())))
    form.append('subject', subject); form.append('body_html', bodyHtml); form.append('settings_json', JSON.stringify(settings))
    try {
      const response = await fetch(`${API_URL}/send`, { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Falha no envio.')
      const failed = result.failures as { filename: string; error: string }[]
      setNotice(failed.length ? `${result.sent.length} enviado(s). Falharam: ${failed.map(f => f.filename).join(', ')}.` : `${result.sent.length} e-mail(s) enviado(s) com sucesso.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha no envio.') }
    finally { setLoading(false) }
  }

  return <main>
    <header className="app-header">
      <a className="back-link" href="/" aria-label="Voltar para a página inicial">← <span>Voltar</span></a>
      <div className="header-title"><img src="./logo.png" alt="" /><div><h1>Envio de instrumentos contratuais</h1><p className="sub">Envie atas e contratos em lote, com um e-mail individual por documento.</p></div></div>
    </header>
    <section className="card">
      <div className="section-title"><span>1</span><div><h2>Documentos e destinatários</h2><p>O sistema usa o segundo resultado de “E-mail institucional” encontrado em cada PDF.</p></div></div>
      <div className="upload"><input ref={inputRef} type="file" accept="application/pdf" multiple onChange={e => addFiles(e.target.files)} /><strong>Selecionar PDFs</strong><small>Você pode selecionar vários contratos ou atas.</small></div>
      {documents.length > 0 && <div className="documents">{documents.map((doc, index) => <div className="doc" key={`${doc.file.name}-${index}`}><div><strong>{doc.file.name}</strong><small>{(doc.file.size / 1024 / 1024).toFixed(2)} MB {doc.error && <em>{doc.error}</em>}</small></div><input aria-label={`Destinatário de ${doc.file.name}`} value={doc.recipient} placeholder="destinatario@instituicao.gov.br" onChange={e => setDocuments(all => all.map((d, i) => i === index ? { ...d, recipient: e.target.value, error: undefined } : d))}/><button className="remove" onClick={() => setDocuments(all => all.filter((_, i) => i !== index))} aria-label="Remover documento">×</button></div>)}</div>}
    </section>
    <section className="card">
      <div className="section-title"><span>2</span><div><h2>Mensagem</h2><p>O assunto e o texto já vêm preenchidos e podem ser ajustados.</p></div></div>
      <label>Assunto<input value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label>Corpo do e-mail</label>
      <div className="rich-editor" role="group" aria-label="Editor do corpo do e-mail">
        <div className="editor-toolbar" role="toolbar" aria-label="Formatação do texto">
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatEmail('bold')} title="Negrito"><strong>N</strong></button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatEmail('italic')} title="Itálico"><em>I</em></button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatEmail('insertUnorderedList')} title="Lista com marcadores">• Lista</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatEmail('insertOrderedList')} title="Lista numerada">1. Lista</button>
        </div>
        <div ref={editorRef} className="editor-content" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={e => setBodyHtml(e.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </div>
    </section>
    <section className="card">
      <div className="section-title"><span>3</span><div><h2>Servidor de e-mail</h2><p>Uma cópia de cada mensagem será enviada automaticamente ao e-mail remetente.</p></div></div>
      <div className="grid"><label>Servidor SMTP<input placeholder="smtp.exemplo.com" value={settings.host} onChange={e => updateSettings('host', e.target.value)} /></label><label>Porta<input type="number" value={settings.port} onChange={e => updateSettings('port', Number(e.target.value))} /></label><label>E-mail remetente<input type="email" placeholder="voce@prefeitura.sp.gov.br" value={settings.username} onChange={e => updateSettings('username', e.target.value)} /></label><label>Senha ou senha de aplicativo<input type="password" value={settings.password} onChange={e => updateSettings('password', e.target.value)} /></label><label>Segurança<select value={settings.security} onChange={e => updateSettings('security', e.target.value as Security)}><option value="starttls">STARTTLS (recomendado)</option><option value="ssl">SSL/TLS</option><option value="none">Sem criptografia</option></select></label></div>
      <div className="settings-action"><button className="secondary" onClick={saveConfiguration}>Salvar configurações neste navegador</button></div>
      <p className="privacy">As configurações ficam apenas no armazenamento local deste navegador. A senha é enviada ao servidor exclusivamente durante o envio SMTP e não é armazenada no Render.</p>
    </section>
    <footer><p className={notice.includes('sucesso') ? 'success' : ''}>{notice}</p><button className="send" disabled={loading} onClick={send}>{loading ? 'Aguarde…' : `Enviar ${documents.length || ''} ${documents.length === 1 ? 'documento' : 'documentos'}`}</button></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
