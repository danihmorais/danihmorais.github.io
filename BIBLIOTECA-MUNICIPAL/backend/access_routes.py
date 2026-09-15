import main


@main.app.get("/")
def root():
    return {"status": "ok", "sistema": main.app.title, "login": "/api/auth/login", "metodo_login": "POST"}


@main.app.get("/api")
def api_root():
    return {"status": "ok", "sistema": main.app.title}
