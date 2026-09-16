from datetime import date, datetime
import sqlite3

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

import main


class UsuarioUpdateIn(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    login: str = Field(min_length=2, max_length=80)
    perfil: str = Field(pattern=r"^(Administrador|Atendente|Consulta)$")
    senha: str | None = Field(default=None, min_length=8, max_length=256)


class PasswordChangeIn(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=256)
    nova_senha: str = Field(min_length=8, max_length=256)


class PasswordResetIn(BaseModel):
    nova_senha: str = Field(min_length=8, max_length=256)


class DevolucaoIn(BaseModel):
    quantidade: int | None = Field(default=None, ge=1)


class RenovacaoIn(BaseModel):
    prevista_devolucao: str


def admin(user):
    if user["perfil"] != "Administrador":
        raise HTTPException(403, "Somente administradores podem realizar esta operação.")


def due_date(value: str):
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(422, "A data deve estar no formato AAAA-MM-DD.")
    if parsed < date.today():
        raise HTTPException(422, "A data de devolução prevista não pode ser anterior a hoje.")
    return parsed


@main.app.put("/api/livros/{livro_id}")
def update_livro(livro_id: int, data: main.LivroIn, user=Depends(main.current_user)):
    conn=main.db(); row=conn.execute("SELECT * FROM livros WHERE id=?",(livro_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Livro não encontrado.")
    isbn=main.re.sub(r"[^0-9Xx]","",data.isbn).upper()
    main.validate_year(data.ano) if hasattr(main,"validate_year") else None
    borrowed=conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE livro_id=? AND devolvida_em IS NULL",(livro_id,)).fetchone()["v"]
    if data.quantidade < borrowed: conn.close(); raise HTTPException(409,f"A quantidade não pode ser menor que os {borrowed} exemplar(es) atualmente emprestados.")
    if isbn and conn.execute("SELECT id FROM livros WHERE ativo=1 AND isbn=? AND id<>?",(isbn,livro_id)).fetchone(): conn.close(); raise HTTPException(409,"Já existe outro livro ativo cadastrado com este ISBN.")
    conn.execute("UPDATE livros SET titulo=?,autor=?,editora=?,ano=?,isbn=?,categoria=?,idioma=?,quantidade=?,localizacao=?,descricao=?,atualizado_em=? WHERE id=?",(data.titulo.strip(),data.autor.strip(),data.editora.strip(),data.ano,isbn,data.categoria.strip(),data.idioma.strip() or "Português",data.quantidade,data.localizacao.strip(),data.descricao.strip(),main.now_iso(),livro_id))
    main.log(conn,"ALTERAR","livro",livro_id,f"Livro {row['codigo']} alterado"); conn.commit(); result=conn.execute("SELECT * FROM livros WHERE id=?",(livro_id,)).fetchone(); conn.close(); return main.row_dict(result)


@main.app.post("/api/livros/{livro_id}/inativar")
def inativar_livro(livro_id:int,user=Depends(main.current_user)):
    conn=main.db(); row=conn.execute("SELECT * FROM livros WHERE id=? AND ativo=1",(livro_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Livro ativo não encontrado.")
    open_count=conn.execute("SELECT COALESCE(SUM(quantidade),0) v FROM emprestimos WHERE livro_id=? AND devolvida_em IS NULL",(livro_id,)).fetchone()["v"]
    if open_count: conn.close(); raise HTTPException(409,"Não é possível inativar um livro com empréstimo em aberto.")
    conn.execute("UPDATE livros SET ativo=0,atualizado_em=? WHERE id=?",(main.now_iso(),livro_id)); main.log(conn,"INATIVAR","livro",livro_id,f"Livro {row['codigo']} inativado"); conn.commit(); conn.close(); return {"ok":True}


@main.app.put("/api/pessoas/{pessoa_id}")
def update_pessoa(pessoa_id:int,data:main.PessoaIn,user=Depends(main.current_user)):
    conn=main.db(); row=conn.execute("SELECT * FROM pessoas WHERE id=?",(pessoa_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Pessoa não encontrada.")
    conn.execute("UPDATE pessoas SET nome=?,documento=?,telefone=?,email=?,endereco=?,observacoes=?,atualizado_em=? WHERE id=?",(data.nome.strip(),data.documento.strip(),data.telefone.strip(),data.email.strip(),data.endereco.strip(),data.observacoes.strip(),main.now_iso(),pessoa_id)); main.log(conn,"ALTERAR","pessoa",pessoa_id,f"Pessoa {row['codigo']} alterada"); conn.commit(); result=conn.execute("SELECT * FROM pessoas WHERE id=?",(pessoa_id,)).fetchone(); conn.close(); return main.row_dict(result)


@main.app.post("/api/pessoas/{pessoa_id}/inativar")
def inativar_pessoa(pessoa_id:int,user=Depends(main.current_user)):
    conn=main.db(); row=conn.execute("SELECT * FROM pessoas WHERE id=? AND ativo=1",(pessoa_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Pessoa ativa não encontrada.")
    open_count=conn.execute("SELECT COUNT(*) v FROM emprestimos WHERE pessoa_id=? AND devolvida_em IS NULL",(pessoa_id,)).fetchone()["v"]
    if open_count: conn.close(); raise HTTPException(409,"Não é possível inativar uma pessoa com empréstimo em aberto.")
    conn.execute("UPDATE pessoas SET ativo=0,atualizado_em=? WHERE id=?",(main.now_iso(),pessoa_id)); main.log(conn,"INATIVAR","pessoa",pessoa_id,f"Pessoa {row['codigo']} inativada"); conn.commit(); conn.close(); return {"ok":True}


@main.app.put("/api/usuarios/{usuario_id}")
def update_usuario(usuario_id:int,data:UsuarioUpdateIn,user=Depends(main.current_user)):
    admin(user); conn=main.db(); row=conn.execute("SELECT * FROM usuarios WHERE id=?",(usuario_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Usuário não encontrado.")
    if usuario_id==user["id"] and data.perfil!="Administrador": conn.close(); raise HTTPException(409,"O próprio administrador não pode remover seu perfil de administrador.")
    try:
        if data.senha:
            salt,password_hash=main.hash_password(data.senha); conn.execute("UPDATE usuarios SET nome=?,login=?,perfil=?,senha_salt=?,senha_hash=?,atualizado_em=? WHERE id=?",(data.nome.strip(),data.login.strip(),data.perfil,salt,password_hash,main.now_iso(),usuario_id))
        else:
            conn.execute("UPDATE usuarios SET nome=?,login=?,perfil=?,atualizado_em=? WHERE id=?",(data.nome.strip(),data.login.strip(),data.perfil,main.now_iso(),usuario_id))
    except sqlite3.IntegrityError:
        conn.close(); raise HTTPException(409,"Login já cadastrado.")
    main.log(conn,"ALTERAR","usuario",usuario_id,f"Usuário {row['login']} alterado"); conn.commit(); result=conn.execute("SELECT * FROM usuarios WHERE id=?",(usuario_id,)).fetchone(); conn.close(); return {**main.public_user(result),"ativo":bool(result["ativo"])}


@main.app.post("/api/usuarios/{usuario_id}/inativar")
def inativar_usuario(usuario_id:int,user=Depends(main.current_user)):
    admin(user)
    if usuario_id==user["id"]: raise HTTPException(409,"Você não pode inativar seu próprio usuário.")
    conn=main.db(); row=conn.execute("SELECT * FROM usuarios WHERE id=? AND ativo=1",(usuario_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Usuário ativo não encontrado.")
    conn.execute("UPDATE usuarios SET ativo=0,atualizado_em=? WHERE id=?",(main.now_iso(),usuario_id)); main.log(conn,"INATIVAR","usuario",usuario_id,f"Usuário {row['login']} inativado"); conn.commit(); conn.close(); return {"ok":True}


@main.app.post("/api/usuarios/{usuario_id}/reativar")
def reativar_usuario(usuario_id:int,user=Depends(main.current_user)):
    admin(user); conn=main.db(); row=conn.execute("SELECT * FROM usuarios WHERE id=?",(usuario_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Usuário não encontrado.")
    conn.execute("UPDATE usuarios SET ativo=1,atualizado_em=? WHERE id=?",(main.now_iso(),usuario_id)); main.log(conn,"REATIVAR","usuario",usuario_id,f"Usuário {row['login']} reativado"); conn.commit(); conn.close(); return {"ok":True}


@main.app.post("/api/usuarios/{usuario_id}/reset-password")
def reset_password(usuario_id:int,data:PasswordResetIn,user=Depends(main.current_user)):
    admin(user); conn=main.db(); row=conn.execute("SELECT * FROM usuarios WHERE id=? AND ativo=1",(usuario_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Usuário ativo não encontrado.")
    salt,password_hash=main.hash_password(data.nova_senha); conn.execute("UPDATE usuarios SET senha_salt=?,senha_hash=?,atualizado_em=? WHERE id=?",(salt,password_hash,main.now_iso(),usuario_id)); main.log(conn,"RESETAR_SENHA","usuario",usuario_id,f"Senha do usuário {row['login']} redefinida pelo administrador"); conn.commit(); conn.close(); return {"ok":True}


@main.app.post("/api/auth/change-password")
def change_password(data:PasswordChangeIn,user=Depends(main.current_user)):
    conn=main.db(); row=conn.execute("SELECT * FROM usuarios WHERE id=? AND ativo=1",(user["id"],)).fetchone()
    if not row or not main.verify_password(data.senha_atual,row["senha_salt"],row["senha_hash"]): conn.close(); raise HTTPException(400,"A senha atual está incorreta.")
    salt,password_hash=main.hash_password(data.nova_senha); conn.execute("UPDATE usuarios SET senha_salt=?,senha_hash=?,atualizado_em=? WHERE id=?",(salt,password_hash,main.now_iso(),user["id"])); main.log(conn,"ALTERAR_SENHA",user["id"],f"Senha do usuário {user['login']} alterada"); conn.commit(); conn.close(); return {"ok":True}


@main.app.post("/api/emprestimos/{emprestimo_id}/devolver")
def enhanced_devolver(emprestimo_id:int,data:DevolucaoIn|None=None,user=Depends(main.current_user)):
    conn=main.db(); e=conn.execute("SELECT e.*,l.codigo livro_codigo,p.nome pessoa_nome FROM emprestimos e JOIN livros l ON l.id=e.livro_id JOIN pessoas p ON p.id=e.pessoa_id WHERE e.id=?",(emprestimo_id,)).fetchone()
    if not e: conn.close(); raise HTTPException(404,"Empréstimo não encontrado.")
    if e["devolvida_em"]: conn.close(); raise HTTPException(409,"Este empréstimo já foi devolvido.")
    qty=data.quantidade if data and data.quantidade else e["quantidade"]
    if qty>e["quantidade"]: conn.close(); raise HTTPException(409,"A quantidade devolvida não pode ser maior que a quantidade emprestada.")
    t=main.now_iso()
    if qty==e["quantidade"]:
        conn.execute("UPDATE emprestimos SET devolvida_em=? WHERE id=?",(t,emprestimo_id)); result_id=emprestimo_id; description=f"Empréstimo {e['codigo']} devolvido: {e['livro_codigo']} por {e['pessoa_nome']}"
    else:
        conn.execute("UPDATE emprestimos SET quantidade=quantidade-? WHERE id=?",(qty,emprestimo_id)); code=f"{e['codigo']}-DEV{qty}-{datetime.now().strftime('%H%M%S')}"; cur=conn.execute("INSERT INTO emprestimos(codigo,livro_id,pessoa_id,quantidade,retirada_em,prevista_devolucao,devolvida_em,observacoes) VALUES(?,?,?,?,?,?,?,?)",(code,e["livro_id"],e["pessoa_id"],qty,e["retirada_em"],e["prevista_devolucao"],t,e["observacoes"])); result_id=cur.lastrowid; description=f"Devolução parcial de {qty} exemplar(es) do empréstimo {e['codigo']}"
    main.log(conn,"DEVOLVER","emprestimo",emprestimo_id,description,{"quantidade":qty,"parcial":qty<e["quantidade"]}); conn.commit(); result=conn.execute("SELECT * FROM emprestimos WHERE id=?",(result_id,)).fetchone(); conn.close(); return main.row_dict(result)


@main.app.post("/api/emprestimos/{emprestimo_id}/renovar")
def renovar(emprestimo_id:int,data:RenovacaoIn,user=Depends(main.current_user)):
    new_date=due_date(data.prevista_devolucao); conn=main.db(); e=conn.execute("SELECT * FROM emprestimos WHERE id=?",(emprestimo_id,)).fetchone()
    if not e: conn.close(); raise HTTPException(404,"Empréstimo não encontrado.")
    if e["devolvida_em"]: conn.close(); raise HTTPException(409,"Não é possível renovar um empréstimo já devolvido.")
    old=date.fromisoformat(e["prevista_devolucao"])
    if new_date<=old: conn.close(); raise HTTPException(422,"A nova data deve ser posterior à data atualmente prevista.")
    conn.execute("UPDATE emprestimos SET prevista_devolucao=? WHERE id=?",(new_date.isoformat(),emprestimo_id)); main.log(conn,"RENOVAR","emprestimo",emprestimo_id,f"Empréstimo {e['codigo']} renovado para {new_date.isoformat()}"); conn.commit(); result=conn.execute("SELECT * FROM emprestimos WHERE id=?",(emprestimo_id,)).fetchone(); conn.close(); return main.row_dict(result)
