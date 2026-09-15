from datetime import datetime, timezone
import sqlite3
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
        active = conn.execute("SELECT id,codigo FROM exemplares WHERE livro_id=? AND ativo=1 ORDER BY id", (b["id"],)).fetchall()
        if len(active) < b["quantidade"]:
            for n in range(len(active) + 1, b["quantidade"] + 1):
                code = f"{b['codigo']}-{n:02d}"
                try:
                    conn.execute("INSERT INTO exemplares(livro_id,codigo,criado_em) VALUES(?,?,?)", (b["id"], code, now()))
                except sqlite3.IntegrityError:
                    pass
        elif len(active) > b["quantidade"]:
            excess = len(active) - b["quantidade"]
            candidates = conn.execute("""SELECT x.id FROM exemplares x
                WHERE x.livro_id=? AND x.ativo=1 AND NOT EXISTS (
                  SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL)
                ORDER BY x.id DESC LIMIT ?""", (b["id"], excess)).fetchall()
            for x in candidates:
                conn.execute("UPDATE exemplares SET ativo=0 WHERE id=?", (x["id"],))
    active = conn.execute("""SELECT e.id,e.livro_id,e.quantidade FROM emprestimos e
        WHERE e.devolvida_em IS NULL AND NOT EXISTS (SELECT 1 FROM emprestimo_exemplares x WHERE x.emprestimo_id=e.id)""").fetchall()
    for loan in active:
        available = conn.execute("""SELECT x.id FROM exemplares x
            WHERE x.livro_id=? AND x.ativo=1 AND NOT EXISTS (
              SELECT 1 FROM emprestimo_exemplares y WHERE y.exemplar_id=x.id AND y.devolvida_em IS NULL)
            ORDER BY x.id LIMIT ?""", (loan["livro_id"], loan["quantidade"])).fetchall()
        for x in available:
            conn.execute("INSERT OR IGNORE INTO emprestimo_exemplares(emprestimo_id,exemplar_id) VALUES(?,?)", (loan["id"], x["id"]))
    conn.commit()
    conn.close()


class LoanExemplaresIn(BaseModel):
    livro_id: int
    pessoa_id: int
    exemplar_ids: list[int] = Field(min_length=1)
    prevista_devolucao: str
    observacoes: str = ""


class ReturnExemplaresIn(BaseModel):
    exemplar_ids: list[int] = Field(min_length=1)


def validate_due_date(value: str):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Data de devolução prevista inválida.")
    if parsed.date() < datetime.now().date():
        raise HTTPException(422, "A data de devolução prevista não pode ser anterior a hoje.")


def exemplar_dict(row):
    return dict(row)


@main.app.get("/api/livros/{livro_id}/exemplares")
def list_exemplares(livro_id: int, user=Depends(main.current_user)):
    setup()
    conn = main.db()
    rows = conn.execute("""SELECT x.id,x.livro_id,x.codigo,x.ativo,
      CASE WHEN EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL) THEN 'Emprestado' ELSE 'Disponível' END status,
      e.id emprestimo_id,p.nome pessoa_nome,e.codigo emprestimo_codigo,e.retirada_em,e.prevista_devolucao
      FROM exemplares x LEFT JOIN emprestimo_exemplares ee ON ee.exemplar_id=x.id AND ee.devolvida_em IS NULL
      LEFT JOIN emprestimos e ON e.id=ee.emprestimo_id LEFT JOIN pessoas p ON p.id=e.pessoa_id
      WHERE x.livro_id=? AND x.ativo=1 ORDER BY x.codigo""", (livro_id,)).fetchall()
    conn.close()
    return [exemplar_dict(x) for x in rows]


@main.app.get("/api/acervo-exemplares")
def acervo(user=Depends(main.current_user)):
    setup()
    conn = main.db()
    rows = conn.execute("""SELECT l.id,l.codigo,l.titulo,l.autor,l.foto,l.quantidade,
      COUNT(x.id) exemplares,
      SUM(CASE WHEN x.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=x.id AND ee.devolvida_em IS NULL) THEN 1 ELSE 0 END) disponiveis
      FROM livros l LEFT JOIN exemplares x ON x.livro_id=l.id AND x.ativo=1 WHERE l.ativo=1 GROUP BY l.id ORDER BY l.titulo COLLATE NOCASE""").fetchall()
    conn.close()
    return [exemplar_dict(x) for x in rows]


@main.app.post("/api/emprestimos-com-exemplares")
def create_loan(data: LoanExemplaresIn, user=Depends(main.current_user)):
    validate_due_date(data.prevista_devolucao)
    setup()
    ids = list(dict.fromkeys(data.exemplar_ids))
    if not ids:
        raise HTTPException(400, "Selecione pelo menos um exemplar.")
    conn = main.db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        book = conn.execute("SELECT * FROM livros WHERE id=? AND ativo=1", (data.livro_id,)).fetchone()
        person = conn.execute("SELECT * FROM pessoas WHERE id=? AND ativo=1", (data.pessoa_id,)).fetchone()
        if not book or not person:
            raise HTTPException(404, "Livro ou pessoa não encontrado.")
        qs = ",".join("?" for _ in ids)
        rows = conn.execute(f"""SELECT id,codigo FROM exemplares WHERE livro_id=? AND ativo=1 AND id IN ({qs}) AND NOT EXISTS(SELECT 1 FROM emprestimo_exemplares ee WHERE ee.exemplar_id=exemplares.id AND ee.devolvida_em IS NULL)""", [data.livro_id, *ids]).fetchall()
        if len(rows) != len(ids):
            raise HTTPException(409, "Um ou mais exemplares selecionados já não estão disponíveis.")
        code = main.next_code(conn, "EMP", "emprestimos")
        cur = conn.execute("INSERT INTO emprestimos(codigo,livro_id,pessoa_id,quantidade,retirada_em,prevista_devolucao,observacoes) VALUES(?,?,?,?,?,?,?)", (code, data.livro_id, data.pessoa_id, len(ids), main.now_iso(), data.prevista_devolucao, data.observacoes.strip()))
        loan_id = cur.lastrowid
        for x in rows:
            conn.execute("INSERT INTO emprestimo_exemplares(emprestimo_id,exemplar_id) VALUES(?,?)", (loan_id, x["id"]))
        main.log(conn, "EMPRESTAR", "emprestimo", loan_id, f"{code}: {person['nome']} recebeu {len(ids)} exemplar(es) de {book['titulo']}", {"exemplar_ids": ids, "exemplares": [x["codigo"] for x in rows]})
        conn.commit()
        loan = conn.execute("""SELECT e.*,l.codigo livro_codigo,l.titulo,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?""", (loan_id,)).fetchone()
        return dict(loan)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@main.app.get("/api/emprestimos-detalhados")
def detailed_loans(status: str="ativos", user=Depends(main.current_user)):
    setup()
    conn = main.db()
    clauses=[]
    if status == "ativos": clauses.append("e.devolvida_em IS NULL")
    elif status == "devolvidos": clauses.append("e.devolvida_em IS NOT NULL")
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    loans = conn.execute(f"""SELECT e.id,e.codigo,e.livro_id,e.pessoa_id,e.quantidade,e.retirada_em,e.prevista_devolucao,e.devolvida_em,e.observacoes,l.codigo livro_codigo,l.titulo,l.foto,p.codigo pessoa_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id {where} ORDER BY e.retirada_em DESC""").fetchall()
    result=[]
    for loan in loans:
        d=dict(loan)
        d["exemplares"]=[dict(x) for x in conn.execute("SELECT x.id,x.codigo,ee.devolvida_em FROM emprestimo_exemplares ee JOIN exemplares x ON x.id=ee.exemplar_id WHERE ee.emprestimo_id=? ORDER BY x.codigo", (loan["id"],)).fetchall()]
        result.append(d)
    conn.close()
    return result


@main.app.post("/api/emprestimos/{emprestimo_id}/devolver-exemplares")
def return_exemplares(emprestimo_id:int, data:ReturnExemplaresIn, user=Depends(main.current_user)):
    setup()
    ids = list(dict.fromkeys(data.exemplar_ids))
    conn = main.db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        loan = conn.execute("SELECT * FROM emprestimos WHERE id=?", (emprestimo_id,)).fetchone()
        if not loan or loan["devolvida_em"] is not None:
            raise HTTPException(409, "Empréstimo já encerrado.")
        qs=",".join("?" for _ in ids)
        links=conn.execute(f"SELECT exemplar_id FROM emprestimo_exemplares WHERE emprestimo_id=? AND devolvida_em IS NULL AND exemplar_id IN ({qs})", [emprestimo_id,*ids]).fetchall()
        if len(links)!=len(ids):
            raise HTTPException(409, "Um ou mais exemplares não pertencem ao empréstimo ou já foram devolvidos.")
        t=main.now_iso()
        for x in ids:
            conn.execute("UPDATE emprestimo_exemplares SET devolvida_em=? WHERE emprestimo_id=? AND exemplar_id=?", (t,emprestimo_id,x))
        remaining=conn.execute("SELECT COUNT(*) v FROM emprestimo_exemplares WHERE emprestimo_id=? AND devolvida_em IS NULL", (emprestimo_id,)).fetchone()["v"]
        if remaining==0:
            conn.execute("UPDATE emprestimos SET devolvida_em=?,quantidade=0 WHERE id=?", (t,emprestimo_id))
        else:
            conn.execute("UPDATE emprestimos SET quantidade=? WHERE id=?", (remaining,emprestimo_id))
        main.log(conn,"DEVOLVER","emprestimo",emprestimo_id,f"Devolução de {len(ids)} exemplar(es)",{"exemplar_ids":ids})
        conn.commit()
        return {"ok":True,"devolvida_em":t,"restantes":remaining}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
