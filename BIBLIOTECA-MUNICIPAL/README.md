# Biblioteca Municipal Carlos Eduardo Telles

Sistema independente para gestão do acervo da Biblioteca Municipal Carlos Eduardo Telles, R. Santa Catarina nº 1351, CEP 15.710-009, São Francisco - SP.

## Recursos

- Dashboard com exemplares, títulos, tomadores, empréstimos e atrasos.
- Cadastro de livros com ID patrimonial no padrão `LIV-000001`.
- Leitura de código de barras pela câmera do celular no cadastro de livro.
- Busca automática de dados bibliográficos pelo ISBN, usando Open Library e Google Books como fontes de consulta.
- Cadastro de pessoas tomadoras com ID `MAT-000001`.
- Cadastro de usuários do sistema com senha protegida por hash e perfis.
- Autenticação obrigatória para o sistema e para a API.
- Registro de empréstimos com ID `EMP-000001`, quantidade e data prevista de devolução.
- Registro de devolução e cálculo de disponibilidade.
- Foto da capa/obra armazenada no PC do backend.
- Pesquisa de acervo, pessoas, empréstimos e logs.
- Log permanente das operações relevantes.
- Banco SQLite armazenado somente no computador do backend.
- Interface responsiva para celular, tablet e desktop.
- Endpoint de backup do banco, restrito a administradores.

## Arquitetura

`src/` é o frontend React + TypeScript + Vite e é publicado no GitHub Pages em `/BIBLIOTECA-MUNICIPAL/`.

`backend/` é uma API FastAPI. O banco e as fotos ficam no diretório definido por `BIBLIOTECA_DATA_DIR`; no serviço systemd deste repositório, o diretório é `/home/daniel/BIBLIOTECA-MUNICIPAL/data`. O backend não deve ser publicado no GitHub Pages.

Para acesso pelo celular, o backend precisa estar exposto por uma URL HTTPS acessível pelo dispositivo, por exemplo via Tailscale/Nginx. O frontend já usa como padrão `https://servidor.tail7d4aa4.ts.net/biblioteca-api`; esse valor pode ser substituído por `VITE_BIBLIOTECA_API_URL` no build.

## Autenticação e primeiro acesso

Na primeira inicialização após esta versão, o backend cria um token de configuração em `BIBLIOTECA_DATA_DIR/bootstrap.token` quando existir usuário sem senha ou quando ainda não houver usuários.

No servidor, obtenha o token com:

```bash
cat /home/daniel/BIBLIOTECA-MUNICIPAL/data/bootstrap.token
```

Abra o sistema e use `Primeiro acesso / configurar usuário` para definir o primeiro usuário administrador. O token é removido automaticamente quando a configuração inicial é concluída.

Depois disso, todos os endpoints de dados exigem `Authorization: Bearer <token>`. As sessões são mantidas em memória e são invalidadas após reiniciar o backend.

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
PYTHONPATH="$PWD" pytest -q
```

Os testes cobrem autenticação, proteção contra acesso não autenticado, preflight CORS, configuração inicial, dashboard, criação de livro, criação de tomador, empréstimo, cálculo de disponibilidade, devolução, usuários e geração de logs.
