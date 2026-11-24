# Biblioteca Municipal Carlos Eduardo Telles

Sistema de gestão da Biblioteca Municipal Carlos Eduardo Telles, R. Santa Catarina nº 1351, CEP 15.710-009, São Francisco - SP.

## Estrutura

- `src/` — frontend React + TypeScript.
- `backend/` — módulo FastAPI da Biblioteca, banco SQLite e armazenamento das fotos.
- `backend/tests/` — testes automatizados da API.
- `index.html` — entrada do frontend publicada em `/BIBLIOTECA-MUNICIPAL/` no GitHub Pages.
- `main.py` na raiz do repositório — backend compartilhado que publica a Biblioteca em `/biblioteca-api`.

## Funcionalidades

- Autenticação obrigatória.
- Dashboard do acervo e dos empréstimos.
- Cadastro e pesquisa de livros, pessoas e usuários.
- Leitura de ISBN/código de barras pela câmera do celular.
- Consulta de dados bibliográficos por ISBN.
- Cadastro, edição e exclusão controlada de categorias.
- Controle de exemplares e disponibilidade.
- Empréstimos, devoluções parciais/totais e renovação.
- Fotos das obras armazenadas no computador do backend.
- Logs das operações.
- Banco SQLite mantido no servidor do backend.
- Interface responsiva para celular, tablet e desktop.

## Primeiro acesso

Na primeira inicialização, o backend prepara o acesso administrativo inicial e grava o token de configuração em:

```text
BIBLIOTECA-MUNICIPAL/data/bootstrap.token
```

No servidor, consulte o token no diretório do repositório e use a opção `Primeiro acesso / configurar usuário` na tela de login para criar o primeiro usuário administrador. O token é removido após a configuração inicial.

## Backend

A Biblioteca não possui serviço systemd ou configuração Nginx próprios. O backend da Biblioteca é carregado pelo `main.py` compartilhado na raiz do repositório, que já é o serviço utilizado pelas demais aplicações.

A API pública da Biblioteca fica em:

```text
https://servidor.tail7d4aa4.ts.net/biblioteca-api
```

O endpoint de login é:

```text
POST /biblioteca-api/api/auth/login
```

O Nginx/Tailscale deve continuar encaminhando o tráfego do backend compartilhado para a porta já utilizada pela infraestrutura existente. Não é necessário criar uma nova porta, `.service` ou `location` exclusivo para a Biblioteca.

Para testes locais, o backend compartilhado deve ser iniciado pela forma já utilizada no repositório. O módulo da Biblioteca permanece em `BIBLIOTECA-MUNICIPAL/backend/main.py` e não deve ser executado como um servidor independente em produção.

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
