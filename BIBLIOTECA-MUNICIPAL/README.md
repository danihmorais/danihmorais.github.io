# Biblioteca Municipal Carlos Eduardo Telles

Sistema de gestão da Biblioteca Municipal Carlos Eduardo Telles, R. Santa Catarina nº 1351, CEP 15.710-009, São Francisco - SP.

## Estrutura

- `src/` — frontend React + TypeScript.
- `backend/` — API FastAPI, banco SQLite e armazenamento das fotos.
- `backend/tests/` — testes automatizados da API.
- `index.html` — entrada do frontend publicada em `/BIBLIOTECA-MUNICIPAL/` no GitHub Pages.

## Funcionalidades

- Autenticação obrigatória.
- Dashboard do acervo e dos empréstimos.
- Cadastro e pesquisa de livros, pessoas e usuários.
- Leitura de ISBN/código de barras pela câmera do celular.
- Consulta de dados bibliográficos por ISBN.
- Controle de exemplares e disponibilidade.
- Empréstimos, devoluções parciais/totais e renovação.
- Fotos das obras armazenadas no computador do backend.
- Logs das operações.
- Banco SQLite mantido somente no servidor do backend.
- Interface responsiva para celular, tablet e desktop.

## Primeiro acesso

Na primeira inicialização, o backend prepara o acesso administrativo inicial e grava o token de configuração em:

```text
BIBLIOTECA_DATA_DIR/bootstrap.token
```

No servidor, consulte o token com:

```bash
cat /home/daniel/BIBLIOTECA-MUNICIPAL/data/bootstrap.token
```

Use a opção `Primeiro acesso / configurar usuário` na tela de login para criar o primeiro usuário administrador. O token é removido após a configuração inicial.

## Backend

O serviço utilizado em produção é `backend/biblioteca-municipal.service`, que inicia `backend/server.py`. A API escuta localmente na porta `9100` e deve ser publicada externamente pelo Nginx/Tailscale.

Para instalar as dependências e executar manualmente:

```bash
cd BIBLIOTECA-MUNICIPAL/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python server.py
```

O banco e as fotos são gravados no diretório definido por `BIBLIOTECA_DATA_DIR`.

## Testes

```bash
cd BIBLIOTECA-MUNICIPAL/backend
pip install -r requirements.txt
PYTHONPATH="$PWD" pytest -q
```

## Frontend

```bash
cd BIBLIOTECA-MUNICIPAL
npm install
npm run build
```

A URL padrão da API está configurada no frontend para `https://servidor.tail7d4aa4.ts.net/biblioteca-api` e pode ser substituída no build pela variável `VITE_BIBLIOTECA_API_URL`.
