from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
import main


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def setup():
    conn = main.db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS exemplares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      livro_id INTEGER NOT NULL REFERENCES livros(id),
      codigo TEXT UNIQUE NOT NULL,
      criado_em TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS emprestimo_exemplares (
      emprestimo_id INTEGER NOT NULL REFERENCES emprestimos(id),
      exemplar_id INTEGER NOT NULL REFERENCES exemplares(id),
      devolvida_em TEXT,
      PRIMARY KEY (emprestimo_id, exemplar_id)
    );
    CREATE INDEX IF NOT EXISTS idx_exemplares_livro ON exemplares(livro_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_emprestimo_exemplares_emprestimo ON emprestimo_exemplares(emprestimo_id);
    CREATE INDEX IF NOT EXISTS idx_emprestimo_exemplares_exemplar ON emprestimo_exemplares(exemplar_id);
    """)
    books = conn.execute("SELECT id,codigo,quantidade FROM livros WHERE ativo=1 ORDER BY id").fetchall()
    for b in books:
        active = conn.execute("SELECT id FROM exemplares WHERE livro_id=? AND ativo=1 ORDER BY id", (b["id"],)).fetchall()
        if len(active) < b["quantidade"]:
            for _ in range(len(active) + 1, b["quantidade"] + 1):
                code = next_exemplar_code(conn, b["codigo"])
                conn.execute("INSERT INTO exemplares(livro_id,codigo,criado_em) VALUES(?,?,?)", (b["id"], code, now()))
        elif len(active) > b["quantidade"]:
            excess = len(active) - b["quantidade"]
            candidates = conn.execute("SELECT x.id FROM exemplares x WHERE x.livro_id=? AND x.ativo=1 AND NOT EXISTS (SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL) ORDER BY x.id DESC LIMIT ?", (b["id"], excess)).fetchall()
            for x in candidates: conn.execute("UPDATE exemplares SET ativo=0 WHERE id=?", (x["id"],))
    active = conn.execute("SELECT e.id,e.livro_id,e.quantidade FROM emprestimos e WHERE e.devolvida_em IS NULL AND NOT EXISTS (SELECT 1 FROM emprestimo_exemplares x WHERE x.emprestimo_id=e.id)").fetchall()
    for loan in active:
        available = conn.execute("SELECT x.id FROM exemplares x WHERE x.livro_id=? AND x.ativo=1 AND NOT EXISTS (SELECT 1 FROM emprestimo_exemplares y WHERE y.exemplar_id=x.id AND y.devolvida_em IS NULL) ORDER BY x.id LIMIT ?", (loan["livro_id"], loan["quantidade"])).fetchall()
        for x in available: conn.execute("INSERT OR IGNORE INTO emprestimo_exemplares(emprestimo_id,exemplar_id) VALUES(?,?)", (loan["id"], x["id"]))
    conn.commit(); conn.close()


def next_exemplar_code(conn, livro_codigo):
    prefix=f"{livro_codigo}-"; rows=conn.execute("SELECT codigo FROM exemplares WHERE codigo LIKE ?", (prefix+"%",)).fetchall(); used=set()
    for row in rows:
        suffix=row["codigo"][len(prefix):]
        if suffix.isdigit(): used.add(int(suffix))
    n=1
    while n in used: n+=1
    return f"{livro_codigo}-{n:02d}"


def sync_book_quantity(conn, livro_id):
    count=conn.execute("SELECT COUNT(*) v FROM exemplares WHERE livro_id=? AND ativo=1",(livro_id,)).fetchone()["v"]
    conn.execute("UPDATE livros SET quantidade=?,atualizado_em=? WHERE id=?",(count,main.now_iso(),livro_id)); return count


class LoanExemplaresIn(BaseModel):
    livro_id:int; pessoa_id:int; exemplar_ids:list[int]=Field(min_length=1); prevista_devolucao:str; observacoes:str=""
class ReturnExemplaresIn(BaseModel): exemplar_ids:list[int]=Field(min_length=1)
class ExemplarCreateIn(BaseModel): codigos:list[str]=Field(min_length=1,max_length=500)


def validate_due_date(value:str):
    try: parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError: raise HTTPException(422,"Data de devolução prevista inválida.")
    if parsed.date()<datetime.now().date(): raise HTTPException(422,"A data de devolução prevista não pode ser anterior a hoje.")


@main.app.get("/api/livros/{livro_id}/exemplares")
def list_exemplares(livro_id:int,user=Depends(main.current_user)):
    setup(); conn=main.db()
    rows=conn.execute("""SELECT x.id,x.livro_id,x.codigo,x.ativo,
      CASE WHEN EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL) THEN 'Emprestado' ELSE 'Disponível' END status,
      e.id emprestimo_id,p.nome pessoa_nome,e.codigo emprestimo_codigo,e.retirada_em,e.prevista_devolucao
      FROM exemplares x LEFT JOIN emprestimo_exemplares ee ON ee.exemplar_id=x.id AND ee.devolvida_em IS NULL
      LEFT JOIN emprestimos e ON e.id=ee.emprestimo_id LEFT JOIN pessoas p ON p.id=e.pessoa_id
      WHERE x.livro_id=? AND x.ativo=1 ORDER BY x.codigo""",(livro_id,)).fetchall(); conn.close(); return [dict(x) for x in rows]


@main.app.post("/api/livros/{livro_id}/exemplares")
def add_exemplares(livro_id:int,data:ExemplarCreateIn,user=Depends(main.current_user)):
    setup(); codes=[c.strip() for c in data.codigos if c.strip()]
    if not codes: raise HTTPException(422,"Informe pelo menos um código de exemplar.")
    if len(codes)!=len(set(codes)): raise HTTPException(409,"Não é permitido repetir códigos de exemplar.")
    conn=main.db()
    try:
        conn.execute("BEGIN IMMEDIATE"); book=conn.execute("SELECT id,codigo,titulo FROM livros WHERE id=? AND ativo=1",(livro_id,)).fetchone()
        if not book: raise HTTPException(404,"Livro não encontrado.")
        for code in codes:
            if conn.execute("SELECT id FROM exemplares WHERE codigo=?",(code,)).fetchone(): raise HTTPException(409,f"Já existe um exemplar com o código {code}.")
        created=[]
        for code in codes:
            cur=conn.execute("INSERT INTO exemplares(livro_id,codigo,criado_em) VALUES(?,?,?)",(livro_id,code,now())); created.append({"id":cur.lastrowid,"livro_id":livro_id,"codigo":code,"status":"Disponível","ativo":1})
        quantity=sync_book_quantity(conn,livro_id); main.log(conn,"CRIAR","exemplar",created[0]["id"],f"{len(codes)} exemplar(es) acrescentado(s) ao livro {book['codigo']}",{"livro_id":livro_id,"exemplares":codes,"quantidade":quantity}); conn.commit(); return {"quantidade":quantity,"exemplares":created}
    except Exception:
        conn.rollback(); raise
    finally: conn.close()


@main.app.post("/api/exemplares/{exemplar_id}/inativar")
def inativar_exemplar(exemplar_id:int,user=Depends(main.current_user)):
    setup(); conn=main.db()
    try:
        conn.execute("BEGIN IMMEDIATE"); row=conn.execute("SELECT x.*,l.codigo livro_codigo FROM exemplares x JOIN livros l ON l.id=x.livro_id WHERE x.id=? AND x.ativo=1",(exemplar_id,)).fetchone()
        if not row: raise HTTPException(404,"Exemplar não encontrado.")
        if conn.execute("SELECT 1 FROM emprestimo_exemplares WHERE exemplar_id=? AND devolvida_em IS NULL LIMIT 1",(exemplar_id,)).fetchone(): raise HTTPException(409,"Não é possível inativar um exemplar emprestado.")
        conn.execute("UPDATE exemplares SET ativo=0 WHERE id=?",(exemplar_id,)); quantity=sync_book_quantity(conn,row["livro_id"]); main.log(conn,"INATIVAR","exemplar",exemplar_id,f"Exemplar {row['codigo']} inativado",{"livro_id":row["livro_id"],"quantidade":quantity}); conn.commit(); return {"ok":True,"quantidade":quantity}
    except Exception:
        conn.rollback(); raise
    finally: conn.close()


@main.app.get("/api/acervo-exemplares")
def acervo(user=Depends(main.current_user)):
    setup(); conn=main.db(); rows=conn.execute("""SELECT l.id,l.codigo,l.titulo,l.autor,l.foto,l.quantidade,COUNT(x.id) exemplares,
      SUM(CASE WHEN x.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL) THEN 1 ELSE 0 END) disponiveis
      FROM livros l LEFT JOIN exemplares x ON x.livro_id=l.id AND x.ativo=1 WHERE l.ativo=1 GROUP BY l.id ORDER BY l.titulo COLLATE NOCASE""").fetchall(); conn.close(); return [dict(x) for x in rows]


@main.app.post("/api/emprestimos-com-exemplares")
def create_loan(data:LoanExemplaresIn,user=Depends(main.current_user)):
    validate_due_date(data.prevista_devolucao); setup(); ids=list(dict.fromkeys(data.exemplar_ids)); conn=main.db()
    try:
        conn.execute("BEGIN IMMEDIATE"); book=conn.execute("SELECT * FROM livros WHERE id=? AND ativo=1",(data.livro_id,)).fetchone(); person=conn.execute("SELECT * FROM pessoas WHERE id=? AND ativo=1",(data.pessoa_id,)).fetchone()
        if not book or not person: raise HTTPException(404,"Livro ou pessoa não encontrado.")
        qs=",".join("?" for _ in ids); rows=conn.execute(f"SELECT id,codigo FROM exemplares WHERE livro_id=? AND ativo=1 AND id IN ({qs}) AND NOT EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=exemplares.id AND ee.devolvida_em IS NULL)",[data.livro_id,*ids]).fetchall()
        if len(rows)!=len(ids): raise HTTPException(409,"Um ou mais exemplares selecionados já não estão disponíveis.")
        code=main.next_code(conn,"EMP","emprestimos"); cur=conn.execute("INSERT INTO emprestimos(codigo,livro_id,pessoa_id,quantidade,retirada_em,prevista_devolucao,observacoes) VALUES(?,?,?,?,?,?,?)",(code,data.livro_id,data.pessoa_id,len(ids),main.now_iso(),data.prevista_devolucao,data.observacoes.strip())); loan_id=cur.lastrowid
        for x in rows: conn.execute("INSERT INTO emprestimo_exemplares(emprestimo_id,exemplar_id) VALUES(?,?)",(loan_id,x["id"]))
        main.log(conn,"EMPRESTAR","emprestimo",loan_id,f"{code}: {person['nome']} recebeu {len(ids)} exemplar(es) de {book['titulo']}",{"exemplar_ids":ids,"exemplares":[x["codigo"] for x in rows]}); conn.commit(); loan=conn.execute("SELECT e.*,l.codigo livro_codigo,l.titulo,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(loan_id,)).fetchone(); return dict(loan)
    except Exception:
        conn.rollback(); raise
    finally: conn.close()


@main.app.get("/api/emprestimos-detalhados")
def detailed_loans(status:str="ativos",q:str="",user=Depends(main.current_user)):
    setup(); conn=main.db(); clauses=[]; params=[]
    if status=="ativos": clauses.append("e.devolvida_em IS NULL")
    elif status=="devolvidos": clauses.append("e.devolvida_em IS NOT NULL")
    if q.strip(): term=f"%{q.strip()}%"; clauses.append("(e.codigo LIKE ? OR l.codigo LIKE ? OR l.titulo LIKE ? OR p.codigo LIKE ? OR p.nome LIKE ?)"); params += [term]*5
    where=("WHERE "+" AND ".join(clauses)) if clauses else ""
    loans=conn.execute(f"SELECT e.id,e.codigo,e.livro_id,e.pessoa_id,e.quantidade,e.retirada_em,e.prevista_devolucao,e.devolvida_em,e.observacoes,l.codigo livro_codigo,l.titulo,l.foto,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id {where} ORDER BY e.retirada_em DESC",params).fetchall(); result=[]
    for loan in loans:
        d=dict(loan); d["exemplares"]=[dict(x) for x in conn.execute("SELECT x.id,x.codigo,ee.devolvida_em FROM emprestimo_exemplares ee JOIN exemplares x ON x.id=ee.exemplar_id WHERE ee.emprestimo_id=? ORDER BY x.codigo",(loan["id"],)).fetchall()]; result.append(d)
    conn.close(); return result


@main.app.post("/api/emprestimos/{emprestimo_id}/devolver-exemplares")
def return_exemplares(emprestimo_id:int,data:ReturnExemplaresIn,user=Depends(main.current_user)):
    setup(); ids=list(dict.fromkeys(data.exemplar_ids)); conn=main.db()
    try:
        conn.execute("BEGIN IMMEDIATE"); loan=conn.execute("SELECT * FROM emprestimos WHERE id=?",(emprestimo_id,)).fetchone()
        if not loan or loan["devolvida_em"] is not None: raise HTTPException(409,"Empréstimo já encerrado.")
        qs=",".join("?" for _ in ids); links=conn.execute(f"SELECT exemplar_id FROM emprestimo_exemplares WHERE emprestimo_id=? AND devolvida_em IS NULL AND exemplar_id IN ({qs})",[emprestimo_id,*ids]).fetchall()
        if len(links)!=len(ids): raise HTTPException(409,"Um ou mais exemplares não pertencem ao empréstimo ou já foram devolvidos.")
        t=main.now_iso()
        for x in ids: conn.execute("UPDATE emprestimo_exemplares SET devolvida_em=? WHERE emprestimo_id=? AND exemplar_id=?",(t,emprestimo_id,x))
        remaining=conn.execute("SELECT COUNT(*) v FROM emprestimo_exemplares WHERE emprestimo_id=? AND devolvida_em IS NULL",(emprestimo_id,)).fetchone()["v"]
        if remaining==0: conn.execute("UPDATE emprestimos SET devolvida_em=? WHERE id=?",(t,emprestimo_id))
        else: conn.execute("UPDATE emprestimos SET quantidade=? WHERE id=?",(remaining,emprestimo_id))
        main.log(conn,"DEVOLVER","emprestimo",emprestimo_id,f"Devolução de {len(ids)} exemplar(es)",{"exemplar_ids":ids}); conn.commit(); return {"ok":True,"devolvida_em":t,"restantes":remaining}
    except Exception:
        conn.rollback(); raise
    finally: conn.close()
