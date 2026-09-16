import main
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

TARGET_PATH = "/api/emprestimos/{emprestimo_id}/devolver"

for route in list(main.app.router.routes):
    if getattr(route, "path", None) == TARGET_PATH and "POST" in (getattr(route, "methods", None) or set()):
        main.app.router.routes.remove(route)

import enhancements
import exemplares


class ExemplarCodigoIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=80)


@main.app.put("/api/exemplares/{exemplar_id}/codigo")
def alterar_codigo_exemplar(exemplar_id: int, data: ExemplarCodigoIn, user=Depends(main.current_user)):
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
