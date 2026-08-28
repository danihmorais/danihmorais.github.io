import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Modality = 'Pregão Eletrônico' | 'Pregão Presencial' | 'Dispensa' | 'Concorrência Eletrônica' | 'Concorrência Presencial' | 'Inexigibilidade'
type Instrument = 'Ata' | 'Contrato'
type SupplierData = {
  filename: string
  process_number: string | null
  modality_number: string | null
  detected_modality: string | null
  object: string | null
  contractor: string | null
  cnpj: string | null
  value: string | null
  signature_date: string | null
  signature_datetime: string | null
  vigencia_meses: number | null
  error?: string | null
}
type SupplierDocument = SupplierData & { file: File }

const API_URL = import.meta.env.VITE_API_URL
  ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}/geradorextrato/api`
  : 'http://127.0.0.1:8000/geradorextrato/api'

const MODALITIES: Modality[] = [
  'Pregão Eletrônico',
  'Pregão Presencial',
  'Dispensa',
  'Concorrência Eletrônica',
  'Concorrência Presencial',
  'Inexigibilidade',
]

function maskDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}
function isBrDate(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false
  const [day, month, year] = value.split('/').map(Number)
  const candidate = new Date(year, month - 1, day)
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
}
function maskNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}
function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}
function addMonths(dateText: string, months: number | null) {
  if (!isBrDate(dateText) || !months) return ''
  const [day, month, year] = dateText.split('/').map(Number)
  const target = new Date(year, month - 1, 1)
  target.setMonth(target.getMonth() + months)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return `${String(Math.min(day, lastDay)).padStart(2, '0')}/${String(target.getMonth() + 1).padStart(2, '0')}/${target.getFullYear()}`
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<SupplierDocument[]>([])
  const [modality, setModality] = useState<Modality>('Pregão Eletrônico')
  const [instrument, setInstrument] = useState<Instrument>('Ata')
  const [sector, setSector] = useState('')
  const [vigenciaInicial, setVigenciaInicial] = useState('')
  const [dataExtrato, setDataExtrato] = useState('')
  const [processOverride, setProcessOverride] = useState('')
  const [modalityOverride, setModalityOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const updateDocument = (index: number, patch: Partial<SupplierDocument>) => {
    setDocuments(current => current.map((item, position) => position === index ? { ...item, ...patch } : item))
  }
  const finalDates = useMemo(() => documents.map(item => addMonths(vigenciaInicial, item.vigencia_meses)), [documents, vigenciaInicial])

  async function analyzeFiles(files: FileList | null) {
    if (!files?.length) return
    const selected = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.pdf'))
    if (!selected.length) return setNotice('Selecione arquivos no formato PDF.')
    setBusy(true)
    setNotice(`Lendo ${selected.length} PDF(s), inclusive as assinaturas digitais...`)
    const form = new FormData()
    selected.forEach(file => form.append('files', file))
    try {
      const response = await fetch(`${API_URL}/analyze`, { method: 'POST', body: form })
      const result: SupplierData[] | { detail?: string } = await response.json()
      if (!response.ok || !Array.isArray(result)) throw new Error('detail' in result && result.detail ? result.detail : `Servidor respondeu ${response.status}.`)
      setDocuments(result.map((item, index) => ({ ...item, file: selected[index] })))
      const detected = result.find(item => item.detected_modality)
      if (detected?.detected_modality && MODALITIES.includes(detected.detected_modality as Modality)) setModality(detected.detected_modality as Modality)
      const failures = result.filter(item => item.error)
      setNotice(failures.length ? `${failures.length} PDF(s) precisam de conferência manual.` : 'PDFs analisados. Confira os dados e gere o Word.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível analisar os PDFs.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function generate() {
    if (!documents.length) return setNotice('Selecione pelo menos um PDF.')
    if (!sector.trim()) return setNotice('Informe o setor.')
    if (!isBrDate(vigenciaInicial)) return setNotice('Informe a vigência inicial no formato DD/MM/AAAA.')
    if (!isBrDate(dataExtrato)) return setNotice('Informe a data do extrato no formato DD/MM/AAAA.')
    if (processOverride && !/^\d{1,4}\/\d{4}$/.test(processOverride)) return setNotice('Nº do processo deve estar no formato XX/XXXX.')
    if (modalityOverride && !/^\d{1,4}\/\d{4}$/.test(modalityOverride)) return setNotice('Nº da modalidade deve estar no formato XX/XXXX.')

    const invalid = documents.find(item =>
      !(processOverride || item.process_number) || !(modalityOverride || item.modality_number) ||
      !item.object || !item.contractor || !item.cnpj || !item.value || !item.signature_date || !item.vigencia_meses,
    )
    if (invalid) return setNotice(`Revise “${invalid.filename}”: há campos obrigatórios não localizados.`)

    setBusy(true)
    setNotice('Montando os extratos e inserindo uma seção Next Page entre os fornecedores...')
    const metadata = {
      modality, instrument,
      process_number: processOverride || null,
      modality_number: modalityOverride || null,
      sector: sector.trim(),
      vigencia_inicial: vigenciaInicial,
      data_extrato: dataExtrato,
      documents: documents.map(({ file: _file, ...item }) => item),
    }
    try {
      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ metadata_json: JSON.stringify(metadata) }),
      })
      if (!response.ok) {
        const result: { detail?: string } = await response.json().catch(() => ({}))
        throw new Error(result.detail || `Servidor respondeu ${response.status}.`)
      }
      downloadBlob(await response.blob(), instrument === 'Ata' ? 'Extratos-Ata.docx' : 'Extratos-Contrato.docx')
      setNotice('Documento gerado com sucesso.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível gerar o documento.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="page-shell">
    <header className="hero"><div><a href="/" className="back-link">← Voltar</a><span className="eyebrow">DOCUMENTAÇÃO ADMINISTRATIVA</span><h1>Gerador de Extrato de Ata e Contrato</h1><p>Selecione vários PDFs, confira os dados extraídos e gere um único Word com um extrato por fornecedor.</p></div><div className="hero-mark" aria-hidden="true">EX</div></header>
    <section className="card"><div className="card-heading"><div className="step">1</div><div><h2>Parâmetros</h2><p>Aplicados a todos os fornecedores.</p></div></div>
      <div className="fields-grid">
        <label>Modalidade<select value={modality} onChange={event => setModality(event.target.value as Modality)}>{MODALITIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Instrumento<select value={instrument} onChange={event => setInstrument(event.target.value as Instrument)}><option>Ata</option><option>Contrato</option></select></label>
        <label>Setor<input value={sector} onChange={event => setSector(event.target.value)} placeholder="Ex.: Setor de Licitações e Contratos" /></label>
        <label>Nº do processo <span className="hint">substituir todos (opcional)</span><input value={processOverride} onChange={event => setProcessOverride(maskNumber(event.target.value))} placeholder="XX/XXXX" inputMode="numeric" /></label>
        <label>Nº da modalidade <span className="hint">substituir todos (opcional)</span><input value={modalityOverride} onChange={event => setModalityOverride(maskNumber(event.target.value))} placeholder="XX/XXXX" inputMode="numeric" /></label>
        <label>Vigência inicial<input value={vigenciaInicial} onChange={event => setVigenciaInicial(maskDate(event.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" maxLength={10} /></label>
        <label>Data do extrato<input value={dataExtrato} onChange={event => setDataExtrato(maskDate(event.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" maxLength={10} /></label>
      </div>
    </section>
    <section className="card"><div className="card-heading"><div className="step">2</div><div><h2>PDFs dos fornecedores</h2><p>Extração: última assinatura digital, processo, modalidade, objeto, contratada, segundo CNPJ, valor e vigência.</p></div></div>
      <div className={`dropzone${busy ? ' disabled' : ''}`} onClick={() => !busy && inputRef.current?.click()}><input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={event => void analyzeFiles(event.target.files)}/><span className="upload-icon">↑</span><strong>{busy ? 'Processando PDFs...' : 'Selecionar vários PDFs'}</strong><small>Você pode selecionar todos os fornecedores de uma vez.</small></div>
      {!!documents.length && <div className="documents-list">{documents.map((item, index) => <article className="document-card" key={`${item.filename}-${index}`}>
        <div className="document-head"><div><strong>{item.filename}</strong>{item.detected_modality && <span className="tag">Detectado: {item.detected_modality}</span>}</div><button type="button" className="remove" onClick={() => setDocuments(current => current.filter((_, position) => position !== index))}>Remover</button></div>
        {item.error && <div className="error-box">{item.error}</div>}
        <div className="document-grid">
          <label>Assinatura digital<input value={item.signature_date || ''} readOnly className="readonly" /></label>
          <label>Nº do processo<input value={item.process_number || ''} onChange={event => updateDocument(index, { process_number: maskNumber(event.target.value) })} placeholder="XX/XXXX" /></label>
          <label>Nº da modalidade<input value={item.modality_number || ''} onChange={event => updateDocument(index, { modality_number: maskNumber(event.target.value) })} placeholder="XX/XXXX" /></label>
          <label>Contratada<input value={item.contractor || ''} onChange={event => updateDocument(index, { contractor: event.target.value })} /></label>
          <label>CNPJ<input value={item.cnpj || ''} onChange={event => updateDocument(index, { cnpj: maskCnpj(event.target.value) })} /></label>
          <label>Valor<input value={item.value || ''} onChange={event => updateDocument(index, { value: event.target.value })} /></label>
          <label>Vigência (meses)<input type="number" min={1} max={240} value={item.vigencia_meses ?? ''} onChange={event => updateDocument(index, { vigencia_meses: event.target.value ? Number(event.target.value) : null })} /></label>
          <label>Vigência final<input value={finalDates[index] || ''} readOnly className="readonly" placeholder="Calculada" /></label>
          <label className="full">Objeto<textarea value={item.object || ''} onChange={event => updateDocument(index, { object: event.target.value })} rows={4}/></label>
        </div>
      </article>)}</div>}
    </section>
    <footer className="footer-bar"><div><p className={notice.includes('sucesso') ? 'success' : ''}>{notice || 'Confira os campos e gere o Word.'}</p><small>{documents.length} fornecedor(es) selecionado(s) · Modelo: EXTRATO.docx</small></div><button type="button" className="primary" disabled={busy || !documents.length} onClick={() => void generate()}>{busy ? 'Processando...' : 'Gerar extrato em Word'}</button></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
