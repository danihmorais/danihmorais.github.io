import sqlite3
import main
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

for target_path in ["/api/emprestimos/{emprestimo_id}/devolver", "/api/livros"]:
    for route in list(main.app.router.routes):
        if getattr(route, "path", None) == target_path and "POST" in (getattr(route, "methods", None) or set()):
            main.app.router.routes.remove(route)

import enhancements
import exemplares


class LivroCreateIn(main.LivroIn):
    codigo_exemplar: str = Field(min_length=1, max_length=80)


class ExemplarCodigoIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=80)


@main.app.post("/api/livros")
def create_livro_com_exemplar(data: LivroCreateIn, user=Depends(main.current_user)):
    exemplares.setup()
    conn = main.db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        isbn = main.re.sub(r"[^0-9Xx]", "", data.isbn).upper()
        if len(isbn) not in (0, 10, 13):
            embedded = main.re.search(r"978\d{10}", isbn)
            if embedded and (isbn.startswith("10") or len(isbn) > 13):
                isbn = embedded.group(0)
        if isbn and conn.execute("SELECT id FROM livros WHERE ativo=1 AND isbn=?", (isbn,)).fetchone():
            raise HTTPException(409, "Já existe um livro ativo cadastrado com este ISBN.")
        exemplar_code = data.codigo_exemplar.strip()
        if conn.execute("SELECT id FROM exemplares WHERE codigo=?", (exemplar_code,)).fetchone():
            raise HTTPException(409, f"Já existe um exemplar com o código {exemplar_code}.")
        t = main.now_iso()
        code = main.next_code(conn, "LIV", "livros")
        cur = conn.execute("INSERT INTO livros(codigo,titulo,autor,editora,ano,isbn,categoria,idioma,quantidade,localizacao,descricao,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (code, data.titulo.strip(), data.autor.strip(), data.editora.strip(), data.ano, isbn, data.categoria.strip(), data.idioma.strip() or "Português", 1, data.localizacao.strip(), data.descricao.strip(), t, t))
        exemplar_cur = conn.execute("INSERT INTO exemplares(livro_id,codigo,criado_em) VALUES(?,?,?)", (cur.lastrowid, exemplar_code, t))
        main.log(conn, "CRIAR", "livro", cur.lastrowid, f"Livro {code} cadastrado: {data.titulo}", {"codigo": code})
        main.log(conn, "CRIAR", "exemplar", exemplar_cur.lastrowid, f"Exemplar {exemplar_code} cadastrado para {code}", {"livro_id": cur.lastrowid, "codigo": exemplar_code})
        conn.commit()
        result = conn.execute("SELECT * FROM livros WHERE id=?", (cur.lastrowid,)).fetchone()
        return main.row_dict(result)
    except HTTPException:
        conn.rollback()
        raise
    except sqlite3.IntegrityError:
        conn.rollback()
        raise HTTPException(409, "Não foi possível gerar um cadastro único para o livro/exemplar. Tente novamente.")
    finally:
        conn.close()


@main.app.put("/api/exemplares/{exemplar_id}/codigo")
def alterar_codigo_exemplar(exemplar_id: int, data: ExemplarCodigoIn, user=Depends(main.current_user)):
    exemplares.setup()
    codigo = data.codigo.strip()
    conn = main.db()
    row = conn.execute("SELECT id,livro_id,codigo,ativo FROM exemplares WHERE id=?", (exemplar_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Exemplar não encontrado.")
    if not row["ativo"]:
        conn.close()
        raise HTTPException(409, "O exemplar está inativo.")
    duplicate = conn.execute("SELECT id FROM exemplares WHERE codigo=? AND id<>?", (codigo, exemplar_id)).fetchone()
    if duplicate:
        conn.close()
        raise HTTPException(409, "Já existe um exemplar com este código.")
    conn.execute("UPDATE exemplares SET codigo=? WHERE id=?", (codigo, exemplar_id))
    main.log(conn, "ALTERAR", "exemplar", exemplar_id, f"Código do exemplar alterado para {codigo}", {"codigo": codigo})
    conn.commit()
    result = conn.execute("SELECT id,livro_id,codigo,ativo FROM exemplares WHERE id=?", (exemplar_id,)).fetchone()
    conn.close()
    return dict(result)
