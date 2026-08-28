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
  ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}/email/api`
  : 'http://localhost:8000/api'
const MODALITIES: Modality[] = ['Pregão Eletrônico', 'Pregão Presencial', 'Dispensa', 'Concorrência Eletrônica', 'Concorrência Presencial', 'Inexigibilidade']

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
function maskProcess(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}
function addMonths(dateText: string, months: number | null) {
  if (!isBrDate(dateText) || !months) return ''
  const [day, month, year] = dateText.split('/').map(Number)
  const base = new Date(year, month - 1, 1)
  base.setMonth(base.getMonth() + months)
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return `${String(Math.min(day, lastDay)).padStart(2, '0')}/${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<SupplierDocument[]>([])
  const [modality, setModality] = useState<Modality>('Pregão Eletrônico')
  const [instrument, setInstrument] = useState<Instrument>('Ata')
  const [sector, setSector] = useState('')
  const [vigenciaInicial, setVigenciaInicial] = useState('')
  const [dataExtrato, setDataExtrato] = useState('')
  const [processNumberOverride, setProcessNumberOverride] = useState('')
  const [modalityNumberOverride, setModalityNumberOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const finalDates = useMemo(() => documents.map(document => addMonths(vigenciaInicial, document.vigencia_meses)), [documents, vigenciaInicial])
  const updateDocument = (index: number, patch: Partial<SupplierDocument>) => setDocuments(current => current.map((document, position) => position === index ? { ...document, ...patch } : document))

  async function analyzeFiles(files: FileList | null) {
    if (!files?.length) return
    const selected = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.pdf'))
    if (!selected.length) return setNotice('Selecione arquivos no formato PDF.')
    setBusy(true); setNotice(`Analisando ${selected.length} PDF(s) e procurando as assinaturas digitais...`)
    const form = new FormData(); selected.forEach(file => form.append('files', file))
    try {
      const response = await fetch(`${API_URL}/analyze`, { method: 'POST', body: form })
      const result: SupplierData[] | { detail?: string } = await response.json()
      if (!response.ok || !Array.isArray(result)) throw new Error('detail' in result && result.detail ? result.detail : `Servidor respondeu ${response.status}.`)
      setDocuments(result.map((item, index) => ({ ...item, file: selected[index] })))
      setProcessNumberOverride(result[0]?.process_number || ''); setModalityNumberOverride(result[0]?.modality_number || '')
      const detected = result.find(item => item.detected_modality)
      if (detected && MODALITIES.includes(detected.detected_modality as Modality)) setModality(detected.detected_modality as Modality)
      const failures = result.filter(item => item.error)
      setNotice(failures.length ? `${failures.length} PDF(s) precisam de conferência.` : 'PDFs analisados. Confira os campos antes de gerar.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível analisar os PDFs.') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  function handleFiles(event: ChangeEvent<HTMLInputElement>) { void analyzeFiles(event.target.files) }

  async function generate() {
    if (!documents.length) return setNotice('Selecione pelo menos um PDF.')
    if (!sector.trim()) return setNotice('Informe o setor.')
    if (!isBrDate(vigenciaInicial)) return setNotice('Informe a vigência inicial no formato DD/MM/AAAA.')
    if (!isBrDate(dataExtrato)) return setNotice('Informe a data do extrato no formato DD/MM/AAAA.')
    if (processNumberOverride && !/^\d{1,4}\/\d{4}$/.test(processNumberOverride)) return setNotice('Nº do processo deve estar no formato XX/XXXX.')
    if (modalityNumberOverride && !/^\d{1,4}\/\d{4}$/.test(modalityNumberOverride)) return setNotice('Nº da modalidade deve estar no formato XX/XXXX.')
    const invalid = documents.find(document => !document.process_number || !document.modality_number || !document.object || !document.contractor || !document.cnpj || !document.value || !document.signature_date || !document.vigencia_meses)
    if (invalid) return setNotice(`Revise os dados de “${invalid.filename}”. Há campos obrigatórios sem preenchimento.`)
    setBusy(true); setNotice('Gerando o documento Word a partir do modelo...')
    const metadata = {
      modality, instrument, process_number: processNumberOverride || null, modality_number: modalityNumberOverride || null,
      sector: sector.trim(), vigencia_inicial: vigenciaInicial, data_extrato: dataExtrato,
      documents: documents.map(({ file: _file, ...document }) => document),
    }
    try {
      const form = new FormData(); form.append('metadata_json', JSON.stringify(metadata)); documents.forEach(document => form.append('files', document.file))
      const response = await fetch(`${API_URL}/generate`, { method: 'POST', body: form })
      if (!response.ok) { const result: { detail?: string } = await response.json().catch(() => ({})); throw new Error(result.detail || `Servidor respondeu ${response.status}.`) }
      downloadBlob(await response.blob(), instrument === 'Ata' ? 'Extratos-Ata.docx' : 'Extratos-Contrato.docx')
      setNotice('Documento gerado com sucesso.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível gerar o documento.') }
    finally { setBusy(false) }
  }

  return <main className="page-shell">
    <header className="hero"><div><a href="/" className="back-link">← Voltar</a><span className="eyebrow">DOCUMENTAÇÃO ADMINISTRATIVA</span><h1>Gerador de Extrato de Ata e Contrato</h1><p>Selecione os PDFs assinados, revise os dados extraídos e gere um único Word com um extrato por fornecedor.</p></div><div className="hero-mark" aria-hidden="true">EX</div></header>

    <section className="card"><div className="card-heading"><div className="step">1</div><div><h2>Parâmetros do extrato</h2><p>Esses campos são aplicados a todos os fornecedores.</p></div></div>
      <div className="fields-grid">
        <label>Modalidade<select value={modality} onChange={event => setModality(event.target.value as Modality)}>{MODALITIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Instrumento<select value={instrument} onChange={event => setInstrument(event.target.value as Instrument)}><option>Ata</option><option>Contrato</option></select></label>
        <label>Setor<input value={sector} onChange={event => setSector(event.target.value)} placeholder="Ex.: Setor de Licitações e Contratos" /></label>
        <label>Nº do processo <span className="hint">opcional para sobrescrever</span><input value={processNumberOverride} onChange={event => setProcessNumberOverride(maskProcess(event.target.value))} placeholder="XX/XXXX" inputMode="numeric" /></label>
        <label>Nº da modalidade <span className="hint">opcional para sobrescrever</span><input value={modalityNumberOverride} onChange={event => setModalityNumberOverride(maskProcess(event.target.value))} placeholder="XX/XXXX" inputMode="numeric" /></label>
        <label>Vigência inicial<input value={vigenciaInicial} onChange={event => setVigenciaInicial(maskDate(event.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" maxLength={10} /></label>
        <label>Data do extrato<input value={dataExtrato} onChange={event => setDataExtrato(maskDate(event.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" maxLength={10} /></label>
      </div>
    </section>

    <section className="card"><div className="card-heading"><div className="step">2</div><div><h2>PDFs dos fornecedores</h2><p>O sistema lê a última assinatura digital, o segundo CNPJ distinto, objeto, contratada, valor, números e vigência.</p></div></div>
      <div className={`dropzone${busy ? ' disabled' : ''}`} onClick={() => !busy && inputRef.current?.click()}><input ref={inputRef} type="file" accept="application/pdf" multiple disabled={busy} onChange={handleFiles}/><span className="upload-icon">↑</span><strong>{busy ? 'Processando PDFs...' : 'Selecionar vários PDFs'}</strong><small>Selecione todos os fornecedores de uma vez.</small></div>
      {documents.length > 0 && <div className="documents-list">{documents.map((document, index) => <article className="document-card" key={`${document.filename}-${index}`}>
        <div className="document-head"><div><strong>{document.filename}</strong>{document.detected_modality && <span className="tag">Detectado: {document.detected_modality}</span>}</div><button type="button" className="remove" onClick={() => setDocuments(current => current.filter((_, position) => position !== index))}>Remover</button></div>
        {document.error && <div className="error-box">{document.error}</div>}
        <div className="document-grid">
          <label>Assinatura digital<input value={document.signature_date || ''} readOnly className="readonly" /></label>
          <label>Nº do processo<input value={document.process_number || ''} onChange={event => updateDocument(index, { process_number: maskProcess(event.target.value) })} placeholder="XX/XXXX" /></label>
          <label>Nº da modalidade<input value={document.modality_number || ''} onChange={event => updateDocument(index, { modality_number: maskProcess(event.target.value) })} placeholder="XX/XXXX" /></label>
          <label>Contratada<input value={document.contractor || ''} onChange={event => updateDocument(index, { contractor: event.target.value })} /></label>
          <label>CNPJ<input value={document.cnpj || ''} onChange={event => updateDocument(index, { cnpj: event.target.value })} /></label>
          <label>Valor<input value={document.value || ''} onChange={event => updateDocument(index, { value: event.target.value })} /></label>
          <label>Vigência (meses)<input type="number" min={1} max={240} value={document.vigencia_meses ?? ''} onChange={event => updateDocument(index, { vigencia_meses: event.target.value ? Number(event.target.value) : null })} /></label>
          <label>Vigência final<input value={finalDates[index] || ''} readOnly className="readonly" placeholder="Calculada" /></label>
          <label className="full">Objeto<textarea value={document.object || ''} onChange={event => updateDocument(index, { object: event.target.value })} rows={4}/></label>
        </div>
      </article>)}</div>}
    </section>

    <footer className="footer-bar"><div><p className={notice.includes('sucesso') ? 'success' : ''}>{notice || 'Confira os campos e gere o Word.'}</p><small>{documents.length} fornecedor(es) selecionado(s) • Modelo: {instrument === 'Ata' ? 'EXTRATO ATA.docx' : 'EXTRATO CONTRATO.docx'}</small></div><button type="button" className="primary" disabled={busy || !documents.length} onClick={() => void generate()}>{busy ? 'Processando...' : 'Gerar extrato em Word'}</button></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)