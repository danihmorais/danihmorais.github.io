# Biblioteca Municipal Carlos Eduardo Telles

Sistema independente para gestão do acervo da Biblioteca Municipal Carlos Eduardo Telles, R. Santa Catarina nº 1351, CEP 15.710-009, São Francisco - SP.

## Recursos

- Dashboard com exemplares, títulos, tomadores, empréstimos e atrasos.
- Cadastro de livros com ID patrimonial no padrão `LIV-000001`.
- Cadastro de pessoas tomadoras com ID `MAT-000001`.
- Cadastro de usuários do sistema e perfis.
- Registro de empréstimos com ID `EMP-000001`, quantidade e data prevista de devolução.
- Registro de devolução e cálculo de disponibilidade.
- Foto da capa/obra armazenada no PC do backend.
- Pesquisa de acervo, pessoas, empréstimos e logs.
- Log permanente das operações relevantes.
- Banco SQLite armazenado somente no computador do backend.
- Interface responsiva para celular, tablet e desktop.
- Endpoint de backup do banco.

## Arquitetura

`src/` é o frontend React + TypeScript + Vite e é publicado no GitHub Pages em `/BIBLIOTECA-MUNICIPAL/`.

`backend/` é uma API FastAPI. O banco e as fotos ficam no diretório definido por `BIBLIOTECA_DATA_DIR`; por padrão, em `backend/data/`. O backend não deve ser publicado no GitHub Pages.

Para acesso pelo celular fora do PC, o backend precisa estar exposto por uma URL HTTPS acessível pelo dispositivo, por exemplo via Tailscale/Nginx. O frontend já usa como padrão `https://servidor.tail7d4aa4.ts.net/biblioteca-api`; esse valor pode ser substituído por `VITE_BIBLIOTECA_API_URL` no build.

## Backend no servidor

```bash
cd BIBLIOTECA-MUNICIPAL/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9100
```

Para uso permanente, utilize `biblioteca-municipal.service` como serviço systemd. O exemplo de Nginx em `nginx-biblioteca.conf` encaminha `/biblioteca-api/` para `127.0.0.1:9100/`.

Antes de colocar em produção, ajuste `CORS_ORIGINS` para as origens que realmente usarão o sistema.

## Testes

```bash
cd BIBLIOTECA-MUNICIPAL/backend
pip install -r requirements.txt
pytest -q
```

O teste cobre criação de livro, criação de tomador, empréstimo, cálculo de disponibilidade, devolução e geração de logs.
