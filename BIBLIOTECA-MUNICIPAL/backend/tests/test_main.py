from pathlib import Path

from fastapi.testclient import TestClient


def test_app(tmp_path, monkeypatch):
    data_dir = tmp_path / 'data'
    monkeypatch.setenv('BIBLIOTECA_DATA_DIR', str(data_dir))
    import main
    main.DATA_DIR = data_dir
    main.PHOTO_DIR = data_dir / 'fotos'
    main.DB_PATH = data_dir / 'biblioteca.db'
    main.BOOTSTRAP_TOKEN_PATH = data_dir / 'bootstrap.token'
    main.SESSIONS.clear()
    main.init_db()
    client = TestClient(main.app)

    assert client.get('/health').status_code == 200
    assert client.get('/api/dashboard').status_code == 401
    cors = client.options('/api/usuarios', headers={'Origin': 'https://danihmorais.github.io', 'Access-Control-Request-Method': 'GET'})
    assert cors.status_code == 200

    bootstrap_token = main.BOOTSTRAP_TOKEN_PATH.read_text(encoding='utf-8').strip()
    boot = client.post('/api/auth/bootstrap', json={
        'token': bootstrap_token,
        'nome': 'Administrador',
        'login': 'admin',
        'senha': 'SenhaSegura123!'
    })
    assert boot.status_code == 200

    login = client.post('/api/auth/login', json={'login': 'admin', 'senha': 'SenhaSegura123!'})
    assert login.status_code == 200
    token = login.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    dashboard = client.get('/api/dashboard', headers=headers)
    assert dashboard.status_code == 200
    assert dashboard.json()['emprestimos_recentes'] == []

    book = client.post('/api/livros', headers=headers, json={'titulo':'Dom Casmurro','autor':'Machado de Assis','quantidade':2})
    assert book.status_code == 200
    person = client.post('/api/pessoas', headers=headers, json={'nome':'Maria Silva'})
    assert person.status_code == 200

    loan = client.post('/api/emprestimos', headers=headers, json={'livro_id':book.json()['id'],'pessoa_id':person.json()['id'],'quantidade':1,'prevista_devolucao':'2099-12-31'})
    assert loan.status_code == 200
    assert loan.json()['codigo'] == 'EMP-000001'

    current = client.get('/api/livros', headers=headers).json()[0]
    assert current['disponiveis'] == 1

    returned = client.post(f"/api/emprestimos/{loan.json()['id']}/devolver", headers=headers)
    assert returned.status_code == 200
    assert returned.json()['devolvida_em']
    assert client.get('/api/logs', headers=headers).status_code == 200

    new_user = client.post('/api/usuarios', headers=headers, json={'nome':'Atendente','login':'atendente','perfil':'Atendente','senha':'SenhaAtendente123!'})
    assert new_user.status_code == 200
    assert 'senha_hash' not in new_user.json()
