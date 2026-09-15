import main

DEFAULT_LOGIN = "admin"
DEFAULT_PASSWORD = "biblioteca123"


def ensure_default_admin():
    conn = main.db()
    total = conn.execute("SELECT COUNT(*) v FROM usuarios").fetchone()["v"]
    if total == 0:
        salt, password_hash = main.hash_password(DEFAULT_PASSWORD)
        now = main.now_iso()
        conn.execute(
            "INSERT INTO usuarios(nome,login,perfil,senha_salt,senha_hash,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?)",
            ("Administrador", DEFAULT_LOGIN, "Administrador", salt, password_hash, now, now),
        )
        conn.commit()
    conn.close()
    main.ensure_bootstrap_file()

ensure_default_admin()
