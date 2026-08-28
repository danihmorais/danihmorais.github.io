"""API do Gerador de Extrato de Atas e Contratos."""
from __future__ import annotations
import asyncio, io, json, os, re
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

DATE_RE=re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)")
CURRENCY_RE=re.compile(r"R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))",re.I)
NUMBER_RE=re.compile(r"(?<!\d)(\d{1,4})\s*/\s*(\d{4})(?!\d)")
CNPJ_RE=re.compile(r"(?<!\d)(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\-]\d{4}[/\-]\d{2})(?!\d)")
MONTHS_RE=re.compile(r"(?<!\d)(\d{1,3})\s*(?:mes|m[eê]s|meses)(?![a-z])",re.I)
MODALITIES=[('Pregão Eletrônico',r'preg[aã]o\s+eletr[oô]nico'),('Pregão Presencial',r'preg[aã]o\s+presencial'),('Concorrência Eletrônica',r'concorr[eê]ncia\s+eletr[oô]nica'),('Concorrência Presencial',r'concorr[eê]ncia\s+presencial'),('Dispensa',r'dispensa'),('Inexigibilidade',r'inexigibilidade')]
app=FastAPI(title='Gerador de Extrato de Atas e Contratos')
origins=['https://danihmorais.github.io','http://localhost:5173','http://127.0.0.1:5173']
origins += [x.strip() for x in os.getenv('CORS_ORIGINS','').split(',') if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=False,allow_methods=['*'],allow_headers=['*'])

def spaces(v): return re.sub(r'\s+',' ',v or '').strip()
def number(v):
    m=NUMBER_RE.search(v or ''); return f'{int(m.group(1)):02d}/{m.group(2)}' if m else None
def cnpj(v):
    d=re.sub(r'\D','',v or ''); return f'{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}' if len(d)==14 else v.strip()
def dt_from(d,t=None):
    day,month,year=map(int,re.split(r'[./-]',d)); h=m=s=0
    if t:
        p=list(map(int,t.split(':'))); h=p[0]; m=p[1] if len(p)>1 else 0; s=p[2] if len(p)>2 else 0
    return datetime(year,month,day,h,m,s)

def signature_dates(reader,pages):
    found=[]
    try: fields=reader.get_fields() or {}
    except Exception: fields={}
    def walk(x):
        if isinstance(x,dict):
            marker=x.get('/M') or x.get('M')
            if marker:
                m=re.search(r'D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?',str(marker))
                if m:
                    try:
                        p=[int(y or 0) for y in m.groups()]; z=datetime(*p); found.append((z,z.strftime('%d/%m/%Y')))
                    except ValueError: pass
            for y in x.values():
                if isinstance(y,(dict,list,tuple)): walk(y)
        elif isinstance(x,(list,tuple)):
            for y in x: walk(y)
    walk(fields)
    marker=re.compile(r'assinado\s+digitalmente|assinatura\s+digital|documento\s+assinado|assinad[oa]\s+eletronicamente|assinatura\s+eletr[oô]nica|certificado\s+digital|ICP[-\s]?Brasil',re.I)
    for i,line in enumerate('\n'.join(pages).splitlines()):
        if not marker.search(line): continue
        block=line
        if not DATE_RE.search(block) and i+1<len('\n'.join(pages).splitlines()): block += ' '+ '\n'.join(pages).splitlines()[i+1]
        for m in DATE_RE.finditer(block):
            after=block[m.end():m.end()+25]; tm=re.search(r'(\d{1,2}:\d{2}(?::\d{2})?)',after)
            try: z=dt_from(m.group(),tm.group(1) if tm else None); found.append((z,m.group().replace('-','/').replace('.','/')))
            except ValueError: pass
    if not found:return None,None
    z,s=max(found,key=lambda x:x[0]); return s,z.strftime('%Y-%m-%dT%H:%M:%S')

def process(text):
    for p in [r'(?:n[ºo°]?|n[uú]mero)?\s*(?:do\s+)?processo(?:\s+administrativo)?\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})',r'processo\s*(?:n[ºo°]?|n[uú]mero)\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})']:
        m=re.search(p,text,re.I)
        if m:return number(m.group(1))
    return None

def modality(text):
    for label,pat in MODALITIES:
        m=re.search(pat,text,re.I)
        if m:
            n=NUMBER_RE.search(text[m.end():m.end()+180]); return label,number(n.group()) if n else None
    return None,None

def modality_number(text,detected):
    if detected:
        pat=dict(MODALITIES)[detected]; m=re.search(pat+r'.{0,180}?((?:n[ºo°]?|n[uú]mero)?\s*\d{1,4}\s*/\s*\d{4})',text,re.I|re.S)
        if m:return number(m.group(1))
    for p in [r'(?:n[ºo°]?|n[uú]mero)\s*(?:da\s+)?modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})',r'modalidade\s*[:\-]?\s*(\d{1,4}\s*/\s*\d{4})']:
        m=re.search(p,text,re.I)
        if m:return number(m.group(1))
    return None

def obj(text):
    # OBJETO é deliberadamente uma linha: o primeiro salto de linha encerra o campo.
    m=re.search(r'^\s*OBJETO\s*:\s*([^\r\n]+)',text,re.I|re.M)
    return spaces(m.group(1)) if m else None

def contractor(text):
    m=re.search(r'^\s*CONTRATADA\s*[:\-]?\s*([^\r\n]+)',text,re.I|re.M)
    return spaces(m.group(1)) if m else None

def value(text,last):
    for m in reversed(list(re.finditer(r'total\s+do\s+proponente',text,re.I))):
        v=CURRENCY_RE.search(text[m.end():m.end()+1000])
        if v:return f'R$ {v.group(1)}'
    m=re.search(r'VALOR\s*\(\s*R\$\s*\)',last,re.I)
    if m:
        v=CURRENCY_RE.search(last[m.end():m.end()+300])
        if v:return f'R$ {v.group(1)}'
        v=re.search(r'(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)',last[m.end():m.end()+300])
        if v:return f'R$ {v.group(1)}'
    return None

def months(text):
    for m in reversed(list(re.finditer(r'vig[eê]ncia',text,re.I))):
        v=MONTHS_RE.search(text[m.start():m.end()+220])
        if v:return int(v.group(1))
    return None

def extract(data,filename):
    r=PdfReader(io.BytesIO(data)); pages=[p.extract_text() or '' for p in r.pages]; text='\n'.join(pages)
    if not spaces(text):raise ValueError('Não foi possível extrair texto do PDF. O arquivo pode ser escaneado como imagem.')
    sd,sdt=signature_dates(r,pages); mod,mnum=modality(text); cs=CNPJ_RE.findall(text)
    result={'filename':filename,'process_number':process(text),'modality_number':modality_number(text,mod) or mnum,'detected_modality':mod,'object':obj(text),'contractor':contractor(text),'cnpj':cnpj(cs[1] if len(cs)>1 else cs[0]) if cs else None,'value':value(text,pages[-1] if pages else ''),'signature_date':sd,'signature_datetime':sdt,'vigencia_meses':months(text),'error':None}
    missing=[a for a,k in [('assinatura digital','signature_date'),('nº do processo','process_number'),('nº da modalidade','modality_number'),('objeto','object'),('contratada','contractor'),('CNPJ','cnpj'),('valor','value'),('vigência em meses','vigencia_meses')] if not result[k]]
    if missing:result['error']='Não localizado automaticamente: '+', '.join(missing)+'.'
    return result

def parse_date(v):
    m=DATE_RE.fullmatch(v.strip());
    if not m:raise ValueError('Data inválida. Use DD/MM/AAAA.')
    try:return date(int(m.group(3)),int(m.group(2)),int(m.group(1)))
    except ValueError as e:raise ValueError('Data inválida. Use DD/MM/AAAA.') from e

def add_months(base,n):
    total=base.year*12+base.month-1+n; y=total//12; mo=total%12+1
    nxt=date(y+1,1,1) if mo==12 else date(y,mo+1,1); last=(nxt-date.resolution).day
    return date(y,mo,min(base.day,last))

def replace_element(el,repls):
    for p in el.iter(qn('w:p')):
        nodes=[x for x in p.iter(qn('w:t')) if x.text]; full=''.join(x.text or '' for x in nodes)
        for token,repl in repls.items():
            if token in full:
                first=full.index(token); end=first+len(token); pos=0; a=b=None
                for i,n in enumerate(nodes):
                    t=n.text or ''; e=pos+len(t)
                    if a is None and pos<=first<e:a=i;ao=first-pos
                    if pos<end<=e:b=i;bo=end-pos;break
                    pos=e
                if a is not None and b is not None:
                    if a==b:nodes[a].text=(nodes[a].text or '')[:ao]+repl+(nodes[a].text or '')[bo:]
                    else:
                        nodes[a].text=(nodes[a].text or '')[:ao]+repl
                        for i in range(a+1,b):nodes[i].text=''
                        nodes[b].text=(nodes[b].text or '')[bo:]
                    full=''.join(x.text or '' for x in nodes)

def break_next(sect):
    p=OxmlElement('w:p'); ppr=OxmlElement('w:pPr'); sp=deepcopy(sect) if sect is not None else OxmlElement('w:sectPr'); typ=sp.find(qn('w:type'))
    if typ is None:typ=OxmlElement('w:type');sp.insert(0,typ)
    typ.set(qn('w:val'),'nextPage');ppr.append(sp);p.append(ppr);return p

def generate(meta):
    initial=parse_date(meta['vigencia_inicial']);parse_date(meta['data_extrato']);docs=meta['documents']; path=Path(__file__).parent/'modelo'/'EXTRATO.docx'
    if not path.exists():raise ValueError('Modelo EXTRATO.docx não encontrado.')
    d=Document(str(path)); body=d.element.body; templates=[deepcopy(x) for x in body if x.tag!=qn('w:sectPr')]; sect=deepcopy(body.sectPr)
    for i,item in enumerate(docs):
        if not item.get('signature_date'):raise ValueError(f"Assinatura digital não localizada para {item.get('filename','fornecedor')}.")
        if not item.get('process_number'):raise ValueError(f"Nº do processo não localizado para {item.get('filename','fornecedor')}.")
        if not item.get('modality_number'):raise ValueError(f"Nº da modalidade não localizado para {item.get('filename','fornecedor')}.")
        n=int(item.get('vigencia_meses') or 0)
        if n<=0:raise ValueError(f"Vigência inválida para {item.get('filename','fornecedor')}.")
        final=add_months(initial,n); repl={'{{DATA.ASS}}':item.get('signature_date',''),'{{MODALIDADE}}':meta['modality'],'{{INSTRUMENTO}}':meta['instrument'],'{{N.PROCESSO}}':item['process_number'],'{{N.MODALIDADE}}':item['modality_number'],'{{OBJETO}}':item.get('object',''),'{{SETOR}}':meta['sector'],'{{CONTRATADA}}':item.get('contractor',''),'{{CNPJ}}':item.get('cnpj',''),'{{VALOR}}':item.get('value',''),'{{VIG.INICIAL}}':initial.strftime('%d/%m/%Y'),'{{VIG.FINAL}}':final.strftime('%d/%m/%Y'),'{{DATA.EXTRATO}}':meta['data_extrato']}
        if i==0:replace_element(body,repl)
        else:
            if sect is not None:sect.addprevious(break_next(sect))
            for t in templates:
                x=deepcopy(t);replace_element(x,repl);(sect.addprevious(x) if sect is not None else body.append(x))
    out=io.BytesIO();d.save(out);out.seek(0);return out.getvalue()

@app.get('/api/health')
async def health():return {'status':'ok'}
@app.post('/api/analyze')
async def analyze(files:list[UploadFile]=File(...)):
    async def one(f):
        data=await f.read()
        try:return await run_in_threadpool(extract,data,f.filename or 'documento.pdf')
        except Exception as e:return {'filename':f.filename or 'documento.pdf','process_number':None,'modality_number':None,'detected_modality':None,'object':None,'contractor':None,'cnpj':None,'value':None,'signature_date':None,'signature_datetime':None,'vigencia_meses':None,'error':str(e)}
    return await asyncio.gather(*(one(f) for f in files))
@app.post('/api/generate')
async def generate_api(metadata_json:str=Form(...)):
    try:meta=json.loads(metadata_json);data=await run_in_threadpool(generate,meta)
    except Exception as e:raise HTTPException(status_code=400,detail=str(e)) from e
    name='Extratos-Ata.docx' if meta.get('instrument')=='Ata' else 'Extratos-Contrato.docx'
    return StreamingResponse(io.BytesIO(data),media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',headers={'Content-Disposition':f'attachment; filename="{name}"'})
