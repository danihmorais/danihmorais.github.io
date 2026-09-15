from pathlib import Path
import tempfile

from fastapi.testclient import TestClient


def test_app(tmp_path, monkeypatch):
    monkeypatch.setenv('BIBLIOTECA_DATA_DIR', str(tmp_path / 'data'))
    import main
    main.DATA_DIR = Path(tmp_path / 'data')
    main.PHOTO_DIR = main.DATA_DIR / 'fotos'
    main.DB_PATH = main.DATA_DIR / 'biblioteca.db'
    main.init_db()
    client = TestClient(main.app)
    assert client.get('/health').status_code == 200
    book = client.post('/api/livros', json={'titulo':'Dom Casmurro','autor':'Machado de Assis','quantidade':2}).json()
    person = client.post('/api/pessoas', json={'nome':'Maria Silva'}).json()
    loan = client.post('/api/emprestimos', json={'livro_id':book['id'],'pessoa_id':person['id'],'quantidade':1,'prevista_devolucao':'2099-12-31'}).json()
    assert loan['codigo'] == 'EMP-000001'
    current = client.get('/api/livros').json()[0]
    assert current['disponiveis'] == 1
    returned = client.post(f"/api/emprestimos/{loan['id']}/devolver").json()
    assert returned['devolvida_em']
    assert client.get('/api/logs').status_code == 200
