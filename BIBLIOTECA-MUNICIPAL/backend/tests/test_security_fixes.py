from pathlib import Path

from fastapi.testclient import TestClient


def setup_app(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("BIBLIOTECA_DATA_DIR", str(data_dir))
    import main
    main.DATA_DIR = data_dir
    main.PHOTO_DIR = data_dir / "fotos"
    main.DB_PATH = data_dir / "biblioteca.db"
    main.BOOTSTRAP_TOKEN_PATH = data_dir / "bootstrap.token"
    main.SESSIONS.clear()
    main.init_db()
    import security
    security.LOGIN_FAILURES.clear()
    security.SESSION_TIMES.clear()
    return main, security, TestClient(main.app)


def test_isbn_normalization_and_checksum(monkeypatch):
    import security

    assert security.normalize_isbn("ISBN 978-85-359-0277-5") == "9788535902775"
    assert security.valid_isbn("9788535902775")
    assert security.valid_isbn("0306406152")
    assert not security.valid_isbn("9788535902776")

    monkeypatch.setattr(security, "lookup_isbn_data", lambda isbn: {"isbn": isbn, "titulo": "Livro de teste", "autor": "Autor", "editora": "Editora", "ano": 2020, "idioma": "Português", "descricao": "", "fonte": "Teste"})
    result = security.isbn_response("ISBN-13: 978-85-359-0277-5")
    assert result["isbn"] == "9788535902775"
    assert result["titulo"] == "Livro de teste"


def test_users_endpoint_requires_admin(tmp_path, monkeypatch):
    main, security, client = setup_app(tmp_path, monkeypatch)
    main.SESSIONS["atendente-token"] = {"id": 1, "nome": "Atendente", "login": "atendente", "perfil": "Atendente"}
    main.SESSIONS["admin-token"] = {"id": 2, "nome": "Administrador", "login": "admin", "perfil": "Administrador"}

    denied = client.get("/api/usuarios", headers={"Authorization": "Bearer atendente-token"})
    assert denied.status_code == 403

    allowed = client.get("/api/usuarios", headers={"Authorization": "Bearer admin-token"})
    assert allowed.status_code == 200
    assert isinstance(allowed.json(), list)


def test_rate_limit_does_not_trust_forwarded_for(tmp_path, monkeypatch):
    main, security, client = setup_app(tmp_path, monkeypatch)

    for i in range(5):
        response = client.post("/api/auth/login", json={"login": "inexistente", "senha": "errada"}, headers={"X-Forwarded-For": f"10.0.0.{i}"})
        assert response.status_code == 401

    blocked = client.post("/api/auth/login", json={"login": "inexistente", "senha": "errada"}, headers={"X-Forwarded-For": "192.168.0.99"})
    assert blocked.status_code == 429


def test_session_timeout_invalidates_session(tmp_path, monkeypatch):
    main, security, client = setup_app(tmp_path, monkeypatch)
    import time

    token = "expired-token"
    main.SESSIONS[token] = {"id": 1, "nome": "Admin", "login": "admin", "perfil": "Administrador"}
    now = time.time()
    security.SESSION_TIMES[token] = (now - security.SESSION_ABSOLUTE_SECONDS - 1, now - security.SESSION_ABSOLUTE_SECONDS - 1)

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert token not in main.SESSIONS
