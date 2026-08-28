import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import logo from './assets/logo.png'
import './styles.css'

type Modality = 'Pregão Eletrônico' | 'Pregão Presencial' | 'Dispensa' | 'Concorrência Eletrônica' | 'Concorrência Presencial' | 'Inexigibilidade'
type Instrument = 'Ata' | 'Contrato'
type SupplierData = { filename: string; process_number: string | null; modality_number: string | null; detected_modality: Modality | null; object: string | null; contractor: string | null; cnpj: string | null; value: string | null; signature_date: string | null; signature_datetime: string | null; vigencia_meses: number | null; error?: string | null }
type SupplierDocument = SupplierData & { file: File }

const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const MODALITIES: Modality[] = ['Pregão Eletrônico', 'Pregão Presencial', 'Dispensa', 'Concorrência Eletrônica', 'Concorrência Presencial', 'Inexigibilidade']
const maskDate = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0,2)}/${d.slice(2)}` : `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}` }
const maskNumber = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length <= 2 ? d : `${d.slice(0,2)}/${d.slice(2)}` }
const maskCnpj = (v: string) => { const d = v.replace(/\D/g, '').slice(0,14); if (d.length<=2) return d; if(d.length<=5)return `${d.slice(0,2)}.${d.slice(2)}`; if(d.length<=8)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`; if(d.length<=12)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`; return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}` }
const isBrDate = (v: string) => { if(!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return false; const [d,m,y]=v.split('/').map(Number); const x=new Date(y,m-1,d); return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d }
function addMonths(v: string, months: number | null) { if(!isBrDate(v)||!months)return ''; const [d,m,y]=v.split('/').map(Number); const x=new Date(y,m-1,1); x.setMonth(x.getMonth()+months); const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate(); return `${String(Math.min(d,last)).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}` }
function download(blob: Blob, filename: string) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }

function App() {
  const inputRef=useRef<HTMLInputElement>(null)
  const [documents,setDocuments]=useState<SupplierDocument[]>([])
  const [modality,setModality]=useState<Modality>('Pregão Eletrônico')
  const [instrument,setInstrument]=useState<Instrument>('Ata')
  const [sector,setSector]=useState('')
  const [vigenciaInicial,setVigenciaInicial]=useState('')
  const [dataExtrato,setDataExtrato]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const finalDates=useMemo(()=>documents.map(d=>addMonths(vigenciaInicial,d.vigencia_meses)),[documents,vigenciaInicial])
  const update=(i:number,p:Partial<SupplierDocument>)=>setDocuments(c=>c.map((d,n)=>n===i?{...d,...p}:d))

  async function analyzeFiles(files: FileList|null) {
    if(!files?.length)return
    const selected=Array.from(files).filter(f=>f.name.toLowerCase().endsWith('.pdf'))
    if(!selected.length){setNotice('Selecione pelo menos um arquivo PDF.');return}
    setBusy(true);setNotice(`Analisando ${selected.length} PDF(s)...`)
    const form=new FormData();selected.forEach(f=>form.append('files',f))
    try { const r=await fetch(`${API_URL}/geradorextrato/api/analyze`,{method:'POST',body:form}); const result:SupplierData[]|{detail?:string}=await r.json(); if(!r.ok||!Array.isArray(result))throw new Error('detail' in result&&result.detail?result.detail:`Servidor respondeu ${r.status}.`); setDocuments(result.map((x,i)=>({...x,file:selected[i]}))); const detected=result.find(x=>x.detected_modality);if(detected?.detected_modality)setModality(detected.detected_modality); const errors=result.filter(x=>x.error).length;setNotice(errors?`${errors} PDF(s) precisam de conferência manual.`:'PDFs analisados. Confira os dados extraídos.') } catch(e){setNotice(e instanceof Error?e.message:'Não foi possível analisar os PDFs.')} finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}
  }

  async function generate() {
    if(!documents.length)return setNotice('Selecione pelo menos um PDF.')
    if(!sector.trim())return setNotice('Informe o setor.')
    if(!isBrDate(vigenciaInicial))return setNotice('Informe a vigência inicial no formato DD/MM/AAAA.')
    if(!isBrDate(dataExtrato))return setNotice('Informe a data do extrato no formato DD/MM/AAAA.')
    const invalid=documents.find(d=>!d.process_number||!d.modality_number||!d.object||!d.contractor||!d.cnpj||!d.value||!d.signature_date||!d.vigencia_meses)
    if(invalid)return setNotice(`Revise “${invalid.filename}”: há campos obrigatórios não localizados.`)
    setBusy(true);setNotice('Gerando o documento Word...')
    try { const form=new FormData();form.append('metadata_json',JSON.stringify({modality,instrument,sector:sector.trim(),vigencia_inicial:vigenciaInicial,data_extrato:dataExtrato,documents:documents.map(({file:_file,...d})=>d)}));const r=await fetch(`${API_URL}/geradorextrato/api/generate`,{method:'POST',body:form});if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.detail||`Servidor respondeu ${r.status}.`)}download(await r.blob(),instrument==='Ata'?'Extratos-Ata.docx':'Extratos-Contrato.docx');setNotice('Documento gerado com sucesso.')}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível gerar o documento.')}finally{setBusy(false)}
  }

  return <main className="page-shell">
    <header className="hero"><a href="/" className="back-link">← Voltar</a><div className="brand"><img src={logo} alt=""/><div><span className="eyebrow">DOCUMENTAÇÃO ADMINISTRATIVA</span><h1>Gerador de Extrato</h1><p>Ata ou contrato, a partir dos PDFs assinados dos fornecedores.</p></div></div><div className="hero-mark">EX</div></header>
    <section className="card"><div className="card-heading"><div className="step">1</div><div><h2>Dados do extrato</h2><p>Informações gerais aplicadas aos documentos.</p></div></div><div className="fields-grid">
      <label>Modalidade<select value={modality} onChange={e=>setModality(e.target.value as Modality)}>{MODALITIES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Instrumento<select value={instrument} onChange={e=>setInstrument(e.target.value as Instrument)}><option>Ata</option><option>Contrato</option></select></label>
      <label className="wide">Setor<input value={sector} onChange={e=>setSector(e.target.value)} placeholder="Ex.: Setor de Licitações e Contratos"/></label>
      <label>Vigência inicial<input value={vigenciaInicial} onChange={e=>setVigenciaInicial(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} inputMode="numeric"/></label>
      <label>Data do extrato<input value={dataExtrato} onChange={e=>setDataExtrato(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} inputMode="numeric"/></label>
    </div></section>
    <section className="card"><div className="card-heading"><div className="step">2</div><div><h2>PDFs dos fornecedores</h2><p>O processo e a modalidade são extraídos individualmente de cada PDF.</p></div></div>
      <div className={`dropzone${busy?' disabled':''}`} onClick={()=>!busy&&inputRef.current?.click()}><input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={e=>void analyzeFiles(e.target.files)}/><span className="upload-icon">↑</span><strong>{busy?'Processando PDFs...':'Selecionar vários PDFs'}</strong><small>Selecione todos os fornecedores de uma vez.</small></div>
      {!!documents.length&&<div className="documents-list">{documents.map((d,i)=><article className="document-card" key={`${d.filename}-${i}`}><div className="document-head"><div className="document-title"><strong>{d.filename}</strong>{d.detected_modality&&<span className="tag">{d.detected_modality}</span>}</div><button type="button" className="remove" onClick={()=>setDocuments(c=>c.filter((_,n)=>n!==i))}>Remover</button></div>{d.error&&<div className="error-box">{d.error}</div>}<div className="document-grid">
        <label>Assinatura digital<input value={d.signature_date||''} readOnly className="readonly"/></label><label>Nº do processo<input value={d.process_number||''} onChange={e=>update(i,{process_number:maskNumber(e.target.value)})} placeholder="XX/XXXX"/></label><label>Nº da modalidade<input value={d.modality_number||''} onChange={e=>update(i,{modality_number:maskNumber(e.target.value)})} placeholder="XX/XXXX"/></label><label>Contratada<input value={d.contractor||''} onChange={e=>update(i,{contractor:e.target.value})}/></label><label>CNPJ<input value={d.cnpj||''} onChange={e=>update(i,{cnpj:maskCnpj(e.target.value)})}/></label><label>Valor<input value={d.value||''} onChange={e=>update(i,{value:e.target.value})}/></label><label>Vigência (meses)<input type="number" min={1} max={240} value={d.vigencia_meses??''} onChange={e=>update(i,{vigencia_meses:e.target.value?Number(e.target.value):null})}/></label><label>Vigência final<input value={finalDates[i]||''} readOnly className="readonly"/></label><label className="full">Objeto<textarea value={d.object||''} onChange={e=>update(i,{object:e.target.value})} rows={3}/></label>
      </div></article>)}</div>}
    </section>
    <footer className="footer-bar"><div><p className={notice.includes('sucesso')?'success':''}>{notice||'Confira os dados e gere o Word.'}</p><small>{documents.length} fornecedor(es) selecionado(s) · Modelo: EXTRATO.docx</small></div><button type="button" className="primary" disabled={busy||!documents.length} onClick={()=>void generate()}>{busy?'Processando...':'Gerar extrato em Word'}</button></footer>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
