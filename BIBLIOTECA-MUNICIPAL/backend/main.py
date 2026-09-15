from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
import uuid

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("BIBLIOTECA_DATA_DIR", BASE_DIR / "data")).resolve()
PHOTO_DIR = DATA_DIR / "fotos"
DB_PATH = DATA_DIR / "biblioteca.db"
BOOTSTRAP_TOKEN_PATH = DATA_DIR / "bootstrap.token"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_PHOTO_BYTES = 8 * 1024 * 1024
SESSIONS: dict[str, dict] = {}
PBKDF2_ITERATIONS = 310_000


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def hash_password(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, hash_hex: str):
    try:
        _, candidate = hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(candidate, hash_hex)
    except (ValueError, TypeError):
        return False


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
    columns = {row[1] for row in conn.execute("PRAGMA table_info(usuarios)").fetchall()}
    if "senha_salt" not in columns:
        conn.execute("ALTER TABLE usuarios ADD COLUMN senha_salt TEXT DEFAULT ''")
    if "senha_hash" not in columns:
        conn.execute("ALTER TABLE usuarios ADD COLUMN senha_hash TEXT DEFAULT ''")
    conn.commit()
    conn.close()
    ensure_bootstrap_file()


def ensure_bootstrap_file():
    conn = db()
    pending = conn.execute("SELECT COUNT(*) v FROM usuarios WHERE ativo=1 AND (COALESCE(senha_hash,'')='' OR COALESCE(senha_salt,'')='')").fetchone()["v"]
    total = conn.execute("SELECT COUNT(*) v FROM usuarios WHERE ativo=1").fetchone()["v"]
    conn.close()
    if pending or total == 0:
        if not BOOTSTRAP_TOKEN_PATH.exists():
            BOOTSTRAP_TOKEN_PATH.write_text(secrets.token_urlsafe(32), encoding="utf-8")
            try:
                os.chmod(BOOTSTRAP_TOKEN_PATH, 0o600)
            except OSError:
                pass
    elif BOOTSTRAP_TOKEN_PATH.exists():
        BOOTSTRAP_TOKEN_PATH.unlink()


def next_code(conn, prefix, table):
    row = conn.execute(f"SELECT id FROM {table} ORDER BY id DESC LIMIT 1").fetchone()
    return f"{prefix}-{(row['id'] + 1 if row else 1):06d}"


def log(conn, action, entity, entity_id, description, meta=None):
    conn.execute("INSERT INTO logs(ocorrido_em, acao, entidade, entidade_id, descricao, meta_json) VALUES (?,?,?,?,?,?)",
                 (now_iso(), action, entity, entity_id, description, json.dumps(meta or {}, ensure_ascii=False)))


def public_user(row):
    return {"id": row["id"], "nome": row["nome"], "login": row["login"], "perfil": row["perfil"]}


def current_user(authorization: str | None = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Autenticação necessária.")
    token = authorization[7:].strip()
    user = SESSIONS.get(token)
    if not user:
        raise HTTPException(401, "Sessão expirada.")
    return user


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield
    SESSIONS.clear()


app = FastAPI(title="Biblioteca Municipal Carlos Eduardo Telles", version="1.1.0", lifespan=lifespan)
origins = {"https://danihmorais.github.io", "http://localhost", "http://localhost:5173", "http://127.0.0.1:5173"}
origins.update(x.strip().rstrip("/") for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip())
app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    senha: str = Field(min_length=1, max_length=256)


class BootstrapIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    nome: str = Field(min_length=1, max_length=200)
    login: str = Field(min_length=2, max_length=80)
    senha: str = Field(min_length=8, max_length=256)


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
    senha: str = Field(min_length=8, max_length=256)


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


@app.get("/api/auth/status")
def auth_status():
    conn = db()
    total = conn.execute("SELECT COUNT(*) v FROM usuarios WHERE ativo=1").fetchone()["v"]
    pending = conn.execute("SELECT COUNT(*) v FROM usuarios WHERE ativo=1 AND (COALESCE(senha_hash,'')='' OR COALESCE(senha_salt,'')='')").fetchone()["v"]
    conn.close()
    return {"needs_bootstrap": total == 0 or pending > 0}


@app.post("/api/auth/login")
def login(data: LoginIn):
    conn = db()
    user = conn.execute("SELECT * FROM usuarios WHERE login=? AND ativo=1", (data.login.strip(),)).fetchone()
    conn.close()
    if not user or not user["senha_hash"] or not verify_password(data.senha, user["senha_salt"], user["senha_hash"]):
        raise HTTPException(401, "Login ou senha inválidos.")
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = public_user(user)
    return {"token": token, "usuario": public_user(user)}


@app.post("/api/auth/logout")
def logout(authorization: str | None = None):
    if authorization and authorization.startswith("Bearer "):
        SESSIONS.pop(authorization[7:].strip(), None)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


@app.post("/api/auth/bootstrap")
def bootstrap(data: BootstrapIn):
    ensure_bootstrap_file()
    if not BOOTSTRAP_TOKEN_PATH.exists():
        raise HTTPException(403, "A configuração inicial já foi concluída.")
    expected = BOOTSTRAP_TOKEN_PATH.read_text(encoding="utf-8").strip()
    if not hmac.compare_digest(expected, data.token.strip()):
        raise HTTPException(403, "Token de configuração inválido.")
    conn = db()
    pending = conn.execute("SELECT id FROM usuarios WHERE ativo=1 AND (COALESCE(senha_hash,'')='' OR COALESCE(senha_salt,'')='') ORDER BY id LIMIT 1").fetchone()
    salt, password_hash = hash_password(data.senha)
    try:
        if pending:
            conn.execute("UPDATE usuarios SET nome=?, login=?, perfil='Administrador', senha_salt=?, senha_hash=?, atualizado_em=? WHERE id=?",
                         (data.nome.strip(), data.login.strip(), salt, password_hash, now_iso(), pending["id"]))
            user_id = pending["id"]
            action = "CONFIGURAR"
        else:
            cur = conn.execute("INSERT INTO usuarios(nome,login,perfil,senha_salt,senha_hash,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?)",
                               (data.nome.strip(), data.login.strip(), "Administrador", salt, password_hash, now_iso(), now_iso()))
            user_id = cur.lastrowid
            action = "CRIAR"
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Login já cadastrado.")
    log(conn, action, "usuario", user_id, f"Acesso inicial configurado para {data.login.strip()}")
    conn.commit()
    user = conn.execute("SELECT * FROM usuarios WHERE id=?", (user_id,)).fetchone()
    conn.close()
    ensure_bootstrap_file()
    return {"usuario": public_user(user)}


@app.get("/api/dashboard")
def dashboard(user=Depends(current_user)):
    conn = db()
    total_livros = conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM livros WHERE ativo=1").fetchone()["v"]
    titulos = conn.execute("SELECT COUNT(*) v FROM livros WHERE ativo=1").fetchone()["v"]
    pessoas = conn.execute("SELECT COUNT(*) v FROM pessoas WHERE ativo=1").fetchone()["v"]
    emprestados = conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE devolvida_em IS NULL").fetchone()["v"]
    atrasados = conn.execute("SELECT COUNT(*) v FROM emprestimos WHERE devolvida_em IS NULL AND date(prevista_devolucao) < date('now','localtime')").fetchone()["v"]
    recentes = conn.execute("SELECT e.id,e.codigo,e.livro_id,e.pessoa_id,e.quantidade,e.retirada_em,e.prevista_devolucao,e.devolvida_em,e.observacoes,l.codigo livro_codigo,l.titulo,l.foto,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.devolvida_em IS NULL ORDER BY e.retirada_em DESC LIMIT 6").fetchall()
    logs = conn.execute("SELECT id,ocorrido_em,acao,entidade,entidade_id,descricao,meta_json FROM logs ORDER BY id DESC LIMIT 8").fetchall()
    conn.close()
    return {"livros": total_livros, "titulos": titulos, "pessoas": pessoas, "emprestados": emprestados, "atrasados": atrasados,
            "emprestimos_recentes": [row_dict(x) for x in recentes], "logs_recentes": [row_dict(x) for x in logs]}


@app.get("/api/livros")
def list_livros(q: str = Query(""), status: str = Query("todos"), user=Depends(current_user)):
    conn = db(); params=[]; clauses=["l.ativo=1"]
    if q.strip():
        term=f"%{q.strip()}%"; clauses.append("(l.codigo LIKE ? OR l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ? OR l.categoria LIKE ?)"); params += [term]*5
    if status == "disponivel": clauses.append("(l.quantidade - COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0)) > 0")
    if status == "emprestado": clauses.append("COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0) > 0")
    rows=conn.execute(f"SELECT l.*, l.quantidade - COALESCE((SELECT SUM(e.quantidade) FROM emprestimos e WHERE e.livro_id=l.id AND e.devolvida_em IS NULL),0) disponiveis FROM livros l WHERE {' AND '.join(clauses)} ORDER BY l.titulo COLLATE NOCASE", params).fetchall(); conn.close()
    return [row_dict(r) for r in rows]


@app.get("/api/livros/buscar-isbn")
def buscar_isbn(codigo: str = Query(..., min_length=8, max_length=32), user=Depends(current_user)):
    isbn = re.sub(r"[^0-9Xx]", "", codigo).upper()
    if len(isbn) not in (10, 13) or (len(isbn) == 13 and not isbn.isdigit()) or (len(isbn) == 10 and not re.fullmatch(r"[0-9]{9}[0-9X]", isbn)):
        raise HTTPException(400, "Código não é um ISBN válido.")
    query_isbn = urllib.parse.quote(isbn)
    headers = {"User-Agent": "BibliotecaMunicipalCarlosEduardoTelles/1.1"}
    sources = [
        f"https://openlibrary.org/api/books?bibkeys=ISBN:{query_isbn}&jscmd=data&format=json",
        f"https://www.googleapis.com/books/v1/volumes?q=isbn:{query_isbn}&maxResults=1"
    ]
    for url in sources:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if "openlibrary.org/api/books" in url:
                item = payload.get(f"ISBN:{isbn}")
                if item:
                    authors = ", ".join(x.get("name", "") for x in item.get("authors", []) if x.get("name"))
                    publishers = ", ".join(x.get("name", "") for x in item.get("publishers", []) if x.get("name"))
                    date_value = str(item.get("publish_date", ""))
                    year_match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", date_value)
                    return {"isbn": isbn, "titulo": item.get("title", ""), "autor": authors, "editora": publishers, "ano": int(year_match.group(1)) if year_match else None, "idioma": "Português", "fonte": "Open Library"}
            else:
                items = payload.get("items") or []
                if items:
                    info = items[0].get("volumeInfo") or {}
                    date_value = str(info.get("publishedDate", ""))
                    year_match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", date_value)
                    return {"isbn": isbn, "titulo": info.get("title", ""), "autor": ", ".join(info.get("authors") or []), "editora": info.get("publisher", ""), "ano": int(year_match.group(1)) if year_match else None, "idioma": info.get("language", "") or "Português", "fonte": "Google Books"}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            continue
    raise HTTPException(404, "Não encontrei dados bibliográficos para este ISBN.")


@app.post("/api/livros")
def create_livro(data: LivroIn, user=Depends(current_user)):
    conn=db(); t=now_iso(); code=next_code(conn,'LIV','livros')
    cur=conn.execute("INSERT INTO livros(codigo,titulo,autor,editora,ano,isbn,categoria,idioma,quantidade,localizacao,descricao,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (code,data.titulo.strip(),data.autor.strip(),data.editora.strip(),data.ano,data.isbn.strip(),data.categoria.strip(),data.idioma.strip() or 'Português',data.quantidade,data.localizacao.strip(),data.descricao.strip(),t,t))
    log(conn,'CRIAR','livro',cur.lastrowid,f"Livro {code} cadastrado: {data.titulo}", {'codigo':code}); conn.commit(); r=conn.execute("SELECT * FROM livros WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)


@app.post("/api/livros/{livro_id}/foto")
async def upload_foto(livro_id: int, foto: UploadFile = File(...), user=Depends(current_user)):
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
def foto(nome: str, user=Depends(current_user)):
    safe=Path(nome).name; path=PHOTO_DIR/safe
    if not path.exists(): raise HTTPException(404,'Foto não encontrada.')
    return FileResponse(path)


@app.get("/api/pessoas")
def list_pessoas(q: str = "", user=Depends(current_user)):
    conn=db(); params=[]; clause="ativo=1"
    if q.strip(): clause += " AND (codigo LIKE ? OR nome LIKE ? OR documento LIKE ? OR telefone LIKE ?)"; term=f"%{q.strip()}%"; params=[term]*4
    rows=conn.execute(f"SELECT * FROM pessoas WHERE {clause} ORDER BY nome COLLATE NOCASE",params).fetchall(); conn.close(); return [row_dict(r) for r in rows]


@app.post("/api/pessoas")
def create_pessoa(data: PessoaIn, user=Depends(current_user)):
    conn=db(); t=now_iso(); code=next_code(conn,'MAT','pessoas'); cur=conn.execute("INSERT INTO pessoas(codigo,nome,documento,telefone,email,endereco,observacoes,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?)",(code,data.nome.strip(),data.documento.strip(),data.telefone.strip(),data.email.strip(),data.endereco.strip(),data.observacoes.strip(),t,t)); log(conn,'CRIAR','pessoa',cur.lastrowid,f"Pessoa {code} cadastrada: {data.nome}",{'codigo':code}); conn.commit(); r=conn.execute("SELECT * FROM pessoas WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)


@app.get("/api/usuarios")
def list_usuarios(user=Depends(current_user)):
    conn=db(); rows=conn.execute("SELECT * FROM usuarios WHERE ativo=1 ORDER BY nome COLLATE NOCASE").fetchall(); conn.close(); return [public_user(r) for r in rows]


@app.post("/api/usuarios")
def create_usuario(data: UsuarioIn, user=Depends(current_user)):
    if user["perfil"] != "Administrador": raise HTTPException(403, "Somente administradores podem cadastrar usuários.")
    conn=db(); t=now_iso(); salt, password_hash = hash_password(data.senha)
    try: cur=conn.execute("INSERT INTO usuarios(nome,login,perfil,senha_salt,senha_hash,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?)",(data.nome.strip(),data.login.strip(),data.perfil.strip(),salt,password_hash,t,t))
    except sqlite3.IntegrityError: conn.close(); raise HTTPException(409,'Login já cadastrado.')
    log(conn,'CRIAR','usuario',cur.lastrowid,f"Usuário de sistema criado: {data.nome}"); conn.commit(); r=conn.execute("SELECT * FROM usuarios WHERE id=?",(cur.lastrowid,)).fetchone(); conn.close(); return public_user(r)


@app.get("/api/emprestimos")
def list_emprestimos(status: str = "ativos", q: str = "", user=Depends(current_user)):
    conn=db(); clauses=[]; params=[]
    if status == 'ativos': clauses.append('e.devolvida_em IS NULL')
    elif status == 'devolvidos': clauses.append('e.devolvida_em IS NOT NULL')
    if q.strip(): term=f"%{q.strip()}%"; clauses.append('(e.codigo LIKE ? OR l.codigo LIKE ? OR l.titulo LIKE ? OR p.codigo LIKE ? OR p.nome LIKE ?)'); params += [term]*5
    where=('WHERE '+' AND '.join(clauses)) if clauses else ''
    rows=conn.execute(f"SELECT e.*, l.codigo livro_codigo,l.titulo,l.foto,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id {where} ORDER BY e.retirada_em DESC",params).fetchall(); conn.close(); return [row_dict(r) for r in rows]


@app.post("/api/emprestimos")
def create_emprestimo(data: EmprestimoIn, user=Depends(current_user)):
    conn=db(); livro=conn.execute("SELECT codigo,titulo,quantidade FROM livros WHERE id=? AND ativo=1",(data.livro_id,)).fetchone(); pessoa=conn.execute("SELECT codigo,nome FROM pessoas WHERE id=? AND ativo=1",(data.pessoa_id,)).fetchone()
    if not livro or not pessoa: conn.close(); raise HTTPException(404,'Livro ou pessoa não encontrado.')
    disponiveis=livro['quantidade']-(conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE livro_id=? AND devolvida_em IS NULL",(data.livro_id,)).fetchone()['v'])
    if data.quantidade>disponiveis: conn.close(); raise HTTPException(409,f"Há apenas {disponiveis} exemplar(es) disponível(is).")
    code=next_code(conn,'EMP','emprestimos'); cur=conn.execute("INSERT INTO emprestimos(codigo,livro_id,pessoa_id,quantidade,retirada_em,prevista_devolucao,observacoes) VALUES(?,?,?,?,?,?,?)",(code,data.livro_id,data.pessoa_id,data.quantidade,now_iso(),data.prevista_devolucao,data.observacoes.strip()))
    log(conn,'EMPRESTAR','emprestimo',cur.lastrowid,f"Empréstimo {code}: {livro['codigo']} para {pessoa['nome']}",{'livro':livro['codigo'],'pessoa':pessoa['codigo']}); conn.commit(); r=conn.execute("SELECT e.*,l.codigo livro_codigo,l.titulo,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(cur.lastrowid,)).fetchone(); conn.close(); return row_dict(r)


@app.post("/api/emprestimos/{emprestimo_id}/devolver")
def devolver(emprestimo_id: int, user=Depends(current_user)):
    conn=db(); e=conn.execute("SELECT e.*,l.codigo livro_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(emprestimo_id,)).fetchone()
    if not e: conn.close(); raise HTTPException(404,'Empréstimo não encontrado.')
    if e['devolvida_em']: conn.close(); raise HTTPException(409,'Este empréstimo já foi devolvido.')
    t=now_iso(); conn.execute("UPDATE emprestimos SET devolvida_em=? WHERE id=?",(t,emprestimo_id)); log(conn,'DEVOLVER','emprestimo',emprestimo_id,f"Empréstimo {e['codigo']} devolvido: {e['livro_codigo']} por {e['pessoa_nome']}"); conn.commit(); e=conn.execute("SELECT * FROM emprestimos WHERE id=?",(emprestimo_id,)).fetchone(); conn.close(); return row_dict(e)


@app.get("/api/logs")
def list_logs(q: str = "", limit: int = Query(100, ge=1, le=500), user=Depends(current_user)):
    conn=db(); params=[]; clause='1=1'
    if q.strip(): clause='(acao LIKE ? OR entidade LIKE ? OR descricao LIKE ?)'; term=f"%{q.strip()}%"; params=[term]*3
    rows=conn.execute(f"SELECT * FROM logs WHERE {clause} ORDER BY id DESC LIMIT ?", params+[limit]).fetchall(); conn.close(); return [row_dict(r) for r in rows]


@app.get("/api/backup")
def backup(user=Depends(current_user)):
    if user["perfil"] != "Administrador": raise HTTPException(403, "Somente administradores podem gerar backup.")
    return FileResponse(DB_PATH, filename='biblioteca.db', media_type='application/octet-stream')
