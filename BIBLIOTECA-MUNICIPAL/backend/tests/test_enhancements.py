from fastapi.testclient import TestClient


def setup_client(tmp_path, monkeypatch):
    data_dir=tmp_path/'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv('BIBLIOTECA_DATA_DIR',str(data_dir))
    import main
    main.DATA_DIR=data_dir
    main.PHOTO_DIR=data_dir/'fotos'
    main.DB_PATH=data_dir/'biblioteca.db'
    main.BOOTSTRAP_TOKEN_PATH=data_dir/'bootstrap.token'
    main.SESSIONS.clear()
    main.init_db()
    import route_fix
    import security
    security.LOGIN_FAILURES.clear()
    security.SESSION_TIMES.clear()
    client=TestClient(main.app)
    token=main.BOOTSTRAP_TOKEN_PATH.read_text(encoding='utf-8').strip()
    boot=client.post('/api/auth/bootstrap',json={'token':token,'nome':'Admin','login':'admin','senha':'SenhaSegura123!'})
    assert boot.status_code==200
    login=client.post('/api/auth/login',json={'login':'admin','senha':'SenhaSegura123!'})
    assert login.status_code==200
    return client,{'Authorization':f"Bearer {login.json()['token']}"}


def test_edit_inactivate_and_renew(tmp_path,monkeypatch):
    client,headers=setup_client(tmp_path,monkeypatch)
    book_response=client.post('/api/livros',headers=headers,json={'titulo':'Livro Original','quantidade':1,'codigo_exemplar':'LO-001'})
    assert book_response.status_code==200
    book=book_response.json()
    extra=client.post(f"/api/livros/{book['id']}/exemplares",headers=headers,json={'codigos':['LO-002','LO-003']})
    assert extra.status_code==200
    person=client.post('/api/pessoas',headers=headers,json={'nome':'Pessoa Original'}).json()
    edited=client.put(f"/api/livros/{book['id']}",headers=headers,json={'titulo':'Livro Editado','quantidade':3}).json()
    assert edited['titulo']=='Livro Editado'
    person_edit=client.put(f"/api/pessoas/{person['id']}",headers=headers,json={'nome':'Pessoa Editada'}).json()
    assert person_edit['nome']=='Pessoa Editada'
    loan=client.post('/api/emprestimos',headers=headers,json={'livro_id':book['id'],'pessoa_id':person['id'],'quantidade':3,'prevista_devolucao':'2099-12-31'}).json()
    partial=client.post(f"/api/emprestimos/{loan['id']}/devolver",headers=headers,json={'quantidade':1})
    assert partial.status_code==200
    assert partial.json()['devolvida_em']
    renewed=client.post(f"/api/emprestimos/{loan['id']}/renovar",headers=headers,json={'prevista_devolucao':'2100-12-31'})
    assert renewed.status_code==200
    blocked=client.post(f"/api/livros/{book['id']}/inativar",headers=headers)
    assert blocked.status_code==409


def test_past_due_date_is_rejected(tmp_path,monkeypatch):
    client,headers=setup_client(tmp_path,monkeypatch)
    book=client.post('/api/livros',headers=headers,json={'titulo':'Livro Data','quantidade':1,'codigo_exemplar':'LD-001'}).json()
    person=client.post('/api/pessoas',headers=headers,json={'nome':'Pessoa Data'}).json()
    response=client.post('/api/emprestimos',headers=headers,json={'livro_id':book['id'],'pessoa_id':person['id'],'quantidade':1,'prevista_devolucao':'2020-01-01'})
    assert response.status_code==422
    assert 'anterior a hoje' in response.json()['detail']
