from fastapi.testclient import TestClient


def setup_client(tmp_path, monkeypatch):
    data_dir=tmp_path/'data'
    monkeypatch.setenv('BIBLIOTECA_DATA_DIR',str(data_dir))
    import main
    main.DATA_DIR=data_dir
    main.PHOTO_DIR=data_dir/'fotos'
    main.DB_PATH=data_dir/'biblioteca.db'
    main.BOOTSTRAP_TOKEN_PATH=data_dir/'bootstrap.token'
    main.SESSIONS.clear()
    main.init_db()
    import enhancements
    client=TestClient(main.app)
    token=main.BOOTSTRAP_TOKEN_PATH.read_text(encoding='utf-8').strip()
    boot=client.post('/api/auth/bootstrap',json={'token':token,'nome':'Admin','login':'admin','senha':'SenhaSegura123!'})
    assert boot.status_code==200
    login=client.post('/api/auth/login',json={'login':'admin','senha':'SenhaSegura123!'})
    assert login.status_code==200
    return client,{'Authorization':f"Bearer {login.json()['token']}"}


def test_edit_inactivate_and_renew(tmp_path,monkeypatch):
    client,headers=setup_client(tmp_path,monkeypatch)
    book=client.post('/api/livros',headers=headers,json={'titulo':'Livro Original','quantidade':3}).json()
    person=client.post('/api/pessoas',headers=headers,json={'nome':'Pessoa Original'}).json()
    edited=client.put(f"/api/livros/{book['id']}",headers=headers,json={'titulo':'Livro Editado','quantidade':3}).json()
    assert edited['titulo']=='Livro Editado'
    person_edit=client.put(f"/api/pessoas/{person['id']}",headers=headers,json={'nome':'Pessoa Editada'}).json()
    assert person_edit['nome']=='Pessoa Editada'
    loan=client.post('/api/emprestimos',headers=headers,json={'livro_id':book['id'],'pessoa_id':person['id'],'quantidade':3,'prevista_devolucao':'2099-12-31'}).json()
    partial=client.post(f"/api/emprestimos/{loan['id']}/devolver-parcial",headers=headers,json={'quantidade':1})
    assert partial.status_code==200
    renewed=client.post(f"/api/emprestimos/{loan['id']}/renovar",headers=headers,json={'prevista_devolucao':'2100-12-31'})
    assert renewed.status_code==200
    blocked=client.post(f"/api/livros/{book['id']}/inativar",headers=headers)
    assert blocked.status_code==409
