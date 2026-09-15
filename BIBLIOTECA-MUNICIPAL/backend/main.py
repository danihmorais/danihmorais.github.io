from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import re
import shutil
import sqlite3
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("BIBLIOTECA_DATA_DIR", BASE_DIR / "data")).resolve()
PHOTO_DIR = DATA_DIR / "fotos"
DB_PATH = DATA_DIR / "biblioteca.db"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_PHOTO_BYTES = 8 * 1024 * 1024


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS livros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      titulo TEXT NOT NULL,
      autor TEXT DEFAULT '',
      editora TEXT DEFAULT '',
      ano INTEGER,
      isbn TEXT DEFAULT '',
      categoria TEXT DEFAULT '',
      idioma TEXT DEFAULT 'Português',
      quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
      localizacao TEXT DEFAULT '',
      descricao TEXT DEFAULT '',
      foto TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pessoas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      documento TEXT DEFAULT '',
      telefone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      endereco TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'Atendente',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emprestimos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      livro_id INTEGER NOT NULL REFERENCES livros(id),
      pessoa_id INTEGER NOT NULL REFERENCES pessoas(id),
      quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
      retirada_em TEXT NOT NULL,
      prevista_devolucao TEXT NOT NULL,
      devolvida_em TEXT,
      observacoes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ocorrido_em TEXT NOT NULL,
      acao TEXT NOT NULL,
      entidade TEXT NOT NULL,
      entidade_id INTEGER,
      descricao TEXT NOT NULL,
      meta_json TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_livros_codigo ON livros(codigo);
    CREATE INDEX IF NOT EXISTS idx_livros_titulo ON livros(titulo);
    CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas(nome);
    CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos(devolvida_em);
    CREATE INDEX IF NOT EXISTS idx_logs_ocorrido ON logs(ocorrido_em DESC);
    """)
    conn.commit()
    conn.close()


def next_code(conn, prefix, table):
    row = conn.execute(f"SELECT id FROM {table} ORDER BY id DESC LIMIT 1").fetchone()
    return f"{prefix}-{(row['id'] + 1 if row else 1):06d}"


def log(conn, action, entity, entity_id, description, meta=None):
    conn.execute("INSERT INTO logs(ocorrido_em, acao, entidade, entidade_id, descricao, meta_json) VALUES (?,?,?,?,?,?)",
                 (now_iso(), action, entity, entity_id, description, json.dumps(meta or {}, ensure_ascii=False)))


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield

app = FastAPI(title="Biblioteca Municipal Carlos Eduardo Telles", version="1.0.0", lifespan=lifespan)
origins = {"https://danihmorais.github.io", "http://localhost", "http://localhost:5173", "http://127.0.0.1:5173"}
origins.update(x.strip().rstrip("/") for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip())
app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

class LivroIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=300)
    autor: str = ""
    editora: str = ""
    ano: int | None = None
    isbn: str = ""
    categoria: str = ""
    idioma: str = "Português"
    quantidade: int = Field(default=1, ge=1)
    localizacao: str = ""
    descricao: str = ""

class PessoaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    documento: str = ""
    telefone: str = ""
    email: str = ""
    endereco: str = ""
    observacoes: str = ""

class UsuarioIn(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    login: str = Field(min_length=2, max_length=80)
    perfil: str = "Atendente"

class EmprestimoIn(BaseModel):
    livro_id: int
    pessoa_id: int
    quantidade: int = Field(default=1, ge=1)
    prevista_devolucao: str
    observacoes: str = ""


def row_dict(row):
    return dict(row) if row else None

@app.get("/health")
def health():
    return {"status": "ok", "sistema": app.title}

@app.get("/api/dashboard")
def dashboard():
    conn = db()
    total_livros = conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM livros WHERE ativo=1").fetchone()["v"]
    titulos = conn.execute("SELECT COUNT(*) v FROM livros WHERE ativo=1").fetchone()["v"]
    pessoas = conn.execute("SELECT COUNT(*) v FROM pessoas WHERE ativo=1").fetchone()["v"]
    emprestados = conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE devolvida_em IS NULL").fetchone()["v"]
    atrasados = conn.execute("SELECT COUNT(*) v FROM emprestimos WHERE devolvida_em IS NULL AND date(prevista_devolucao) < date('now','localtime')").fetchone()["v"]
    recentes = conn.execute("SELECT l.codigo, l.titulo, l.foto, p.nome pessoa, e.retirada_em, e.prevista_devolucao FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.devolvida_em IS NULL ORDER BY e.retirada_em DESC LIMIT 6").fetchall()
    logs = conn.execute("SELECT ocorrido_em, acao, entidade, descricao FROM logs ORDER BY id DESC LIMIT 8").fetchall()
    conn.close()
    return {"livros": total_livros, "titulos": titulos, "pessoas": pessoas, "emprestados": emprestados, "atrasados": atrasados,
            "emprestimos_recentes": [row_dict(x) for x in recentes], "logs_recentes": [row_dict(x) for x in logs]}

@app.get("/api/livros")
def list_livros(q: str = Query(""), status: str = Query("todos")):
    conn = db(); params=[]; clauses=["l.ativo=1"]
    if q.strip():
        term=f"%{q.strip()}%"; clauses.append("(l.codigo LIKE ? OR l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ? OR l.categoria LIKE ?)"); params += [term]*5
    if status == "disponivel": clauses.append("(l.quantidade - COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0)) > 0")
    if status == "emprestado": clauses.append("COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0) > 0")
    rows=conn.execute(f"SELECT l.*, l.quantidade - COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0) disponiveis FROM livros l WHERE {' AND '.join(clauses)} ORDER BY l.titulo COLLATE NOCASE", params).fetchall(); conn.close()
    return [row_dict(r) for r in rows]

@app.post("/api/livros")
def create_livro(data: LivroIn):
    conn=db(); t=now_iso(); code=next_code(conn,'LIV','livros')
    cur=conn.execute("INSERT INTO livros(codigo,titulo,autor,editora,ano,isbn,categoria,idioma,quantidade,localizacao,descricao,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (code,data.titulo.strip(),data.autor.strip(),data.editora.strip(),data.ano,data.isbn.strip(),data.categoria.strip(),data.idioma.strip() or 'Português',data.quantidade,data.localizacao.strip(),data.descricao.strip(),t,t))
    log(conn,'CRIAR','livro',cur.lastrowid,f"Livro {code} cadastrado: {data.titulo}", {'codigo':code}); conn.commit(); r=conn.execute("SELECT * FROM livros WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)

@app.post("/api/livros/{livro_id}/foto")
async def upload_foto(livro_id: int, foto: UploadFile = File(...)):
    if foto.content_type not in ALLOWED_IMAGE_TYPES: raise HTTPException(400,'Use JPG, PNG ou WebP.')
    raw=await foto.read()
    if len(raw)>MAX_PHOTO_BYTES: raise HTTPException(413,'A foto deve ter no máximo 8 MB.')
    conn=db(); livro=conn.execute("SELECT codigo,foto FROM livros WHERE id=?",(livro_id,)).fetchone()
    if not livro: conn.close(); raise HTTPException(404,'Livro não encontrado.')
    old=livro['foto']; ext=ALLOWED_IMAGE_TYPES[foto.content_type]; name=f"{livro['codigo']}-{uuid.uuid4().hex}{ext}"; target=PHOTO_DIR/name; target.write_bytes(raw)
    conn.execute("UPDATE livros SET foto=?, atualizado_em=? WHERE id=?",(name,now_iso(),livro_id))
    if old:
        old_path=PHOTO_DIR/Path(old).name
        if old_path.exists(): old_path.unlink()
    log(conn,'ALTERAR','livro',livro_id,f"Foto do livro {livro['codigo']} atualizada")
    conn.commit(); conn.close(); return {'foto':name}

@app.get("/api/fotos/{nome}")
def foto(nome: str):
    safe=Path(nome).name; path=PHOTO_DIR/safe
    if not path.exists(): raise HTTPException(404,'Foto não encontrada.')
    return FileResponse(path)

@app.get("/api/pessoas")
def list_pessoas(q: str = ""):
    conn=db(); params=[]; clause="ativo=1"
    if q.strip(): clause += " AND (codigo LIKE ? OR nome LIKE ? OR documento LIKE ? OR telefone LIKE ?)"; term=f"%{q.strip()}%"; params=[term]*4
    rows=conn.execute(f"SELECT * FROM pessoas WHERE {clause} ORDER BY nome COLLATE NOCASE",params).fetchall(); conn.close(); return [row_dict(r) for r in rows]

@app.post("/api/pessoas")
def create_pessoa(data: PessoaIn):
    conn=db(); t=now_iso(); code=next_code(conn,'MAT','pessoas'); cur=conn.execute("INSERT INTO pessoas(codigo,nome,documento,telefone,email,endereco,observacoes,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?)",(code,data.nome.strip(),data.documento.strip(),data.telefone.strip(),data.email.strip(),data.endereco.strip(),data.observacoes.strip(),t,t)); log(conn,'CRIAR','pessoa',cur.lastrowid,f"Pessoa {code} cadastrada: {data.nome}",{'codigo':code}); conn.commit(); r=conn.execute("SELECT * FROM pessoas WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)

@app.get("/api/usuarios")
def list_usuarios():
    conn=db(); rows=conn.execute("SELECT * FROM usuarios WHERE ativo=1 ORDER BY nome COLLATE NOCASE").fetchall(); conn.close(); return [row_dict(r) for r in rows]

@app.post("/api/usuarios")
def create_usuario(data: UsuarioIn):
    conn=db(); t=now_iso()
    try: cur=conn.execute("INSERT INTO usuarios(nome,login,perfil,criado_em,atualizado_em) VALUES(?,?,?,?,?)",(data.nome.strip(),data.login.strip(),data.perfil.strip(),t,t))
    except sqlite3.IntegrityError: conn.close(); raise HTTPException(409,'Login já cadastrado.')
    log(conn,'CRIAR','usuario',cur.lastrowid,f"Usuário de sistema criado: {data.nome}"); conn.commit(); r=conn.execute("SELECT * FROM usuarios WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)

@app.get("/api/emprestimos")
def list_emprestimos(status: str = "ativos", q: str = ""):
    conn=db(); clauses=[]; params=[]
    if status == 'ativos': clauses.append('e.devolvida_em IS NULL')
    elif status == 'devolvidos': clauses.append('e.devolvida_em IS NOT NULL')
    if q.strip(): term=f"%{q.strip()}%"; clauses.append('(e.codigo LIKE ? OR l.codigo LIKE ? OR l.titulo LIKE ? OR p.codigo LIKE ? OR p.nome LIKE ?)'); params += [term]*5
    where=('WHERE '+' AND '.join(clauses)) if clauses else ''
    rows=conn.execute(f"SELECT e.*, l.codigo livro_codigo,l.titulo,l.foto,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id {where} ORDER BY e.retirada_em DESC",params).fetchall(); conn.close(); return [row_dict(r) for r in rows]

@app.post("/api/emprestimos")
def create_emprestimo(data: EmprestimoIn):
    conn=db(); livro=conn.execute("SELECT codigo,titulo,quantidade FROM livros WHERE id=? AND ativo=1",(data.livro_id,)).fetchone(); pessoa=conn.execute("SELECT codigo,nome FROM pessoas WHERE id=? AND ativo=1",(data.pessoa_id,)).fetchone()
    if not livro or not pessoa: conn.close(); raise HTTPException(404,'Livro ou pessoa não encontrado.')
    disponiveis=livro['quantidade']-(conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE livro_id=? AND devolvida_em IS NULL",(data.livro_id,)).fetchone()['v'])
    if data.quantidade>disponiveis: conn.close(); raise HTTPException(409,f"Há apenas {disponiveis} exemplar(es) disponível(is).")
    code=next_code(conn,'EMP','emprestimos'); cur=conn.execute("INSERT INTO emprestimos(codigo,livro_id,pessoa_id,quantidade,retirada_em,prevista_devolucao,observacoes) VALUES(?,?,?,?,?,?,?)",(code,data.livro_id,data.pessoa_id,data.quantidade,now_iso(),data.prevista_devolucao,data.observacoes.strip()))
    log(conn,'EMPRESTAR','emprestimo',cur.lastrowid,f"Empréstimo {code}: {livro['codigo']} para {pessoa['nome']}",{'livro':livro['codigo'],'pessoa':pessoa['codigo']}); conn.commit(); r=conn.execute("SELECT e.*,l.codigo livro_codigo,l.titulo,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)

@app.post("/api/emprestimos/{emprestimo_id}/devolver")
def devolver(emprestimo_id: int):
    conn=db(); e=conn.execute("SELECT e.*,l.codigo livro_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(emprestimo_id,)).fetchone()
    if not e: conn.close(); raise HTTPException(404,'Empréstimo não encontrado.')
    if e['devolvida_em']: conn.close(); raise HTTPException(409,'Este empréstimo já foi devolvido.')
    t=now_iso(); conn.execute("UPDATE emprestimos SET devolvida_em=? WHERE id=?",(t,emprestimo_id)); log(conn,'DEVOLVER','emprestimo',emprestimo_id,f"Empréstimo {e['codigo']} devolvido: {e['livro_codigo']} por {e['pessoa_nome']}"); conn.commit(); e=conn.execute("SELECT * FROM emprestimos WHERE id=?",(emprestimo_id,)).fetchone(); conn.close(); return row_dict(e)

@app.get("/api/logs")
def list_logs(q: str = "", limit: int = Query(100, ge=1, le=500)):
    conn=db(); params=[]; clause='1=1'
    if q.strip(): clause='(acao LIKE ? OR entidade LIKE ? OR descricao LIKE ?)'; term=f"%{q.strip()}%"; params=[term]*3
    rows=conn.execute(f"SELECT * FROM logs WHERE {clause} ORDER BY id DESC LIMIT ?", params+[limit]).fetchall(); conn.close(); return [row_dict(r) for r in rows]

@app.get("/api/backup")
def backup():
    return FileResponse(DB_PATH, filename='biblioteca.db', media_type='application/octet-stream')
