# 🏛️ Universo da Licitação

Hub de ferramentas web para automação de processos de **licitação pública municipal**, publicado via GitHub Pages.

🔗 **Site:** [danihmorais.github.io](https://danihmorais.github.io)

## 📦 Ferramentas

| Ferramenta | Finalidade |
|---|---|
| 🗂️ **[MontaEdital](./MONTAEDITAL)** | Elaboração da fase preparatória e montagem de editais a partir de modelos `.docx`. |
| 🤖 **[Licita.AI](./LICITA.AI)** | Geração assistida por IA de DFD, ETP e TR a partir dos dados do processo. |
| 📄 **[Conversor Fiorilli](./FIORIILICSVTOWORD)** | Conversão de relatórios `.txt`/`.csv` do Fiorilli para Word. |
| 📁 **[Documentos Modelo](./documentos-modelo.html)** | Consulta e download dos modelos disponibilizados diretamente pelo servidor, via API. |
| ✉️ **[Email ARPs/Contratos](./EMAIL-ATAS-CONTRATOS)** | Envio em lote de atas e contratos em PDF por e-mail. |
| 📑 **[Gerador de Extrato](./GERADOREXTRATO)** | Leitura de PDFs de atas/contratos e geração de extratos padronizados em DOCX. |

## 🧱 Arquitetura

O repositório reúne aplicações independentes em uma mesma publicação:

- **React + TypeScript + Vite:** MontaEdital, Licita.AI, Email ARPs/Contratos e Gerador de Extrato.
- **HTML/CSS/JS:** Conversor Fiorilli e página de Documentos Modelo.
- **FastAPI/Python:** backends para processamento, análise de PDFs e geração/manipulação de `.docx`.
- **GitHub Actions:** build e publicação automática no GitHub Pages.

O backend agregador da raiz monta as aplicações FastAPI sob estes prefixos:

```text
/licita
/monta
/email
/geradorextrato
/estudos
```

A página de **Documentos Modelo** consulta o endpoint `API_URL/files` do servidor. O agregador raiz também expõe `/files/{caminho}` para download individual e `/health` para verificação básica do serviço.

### Documentos Modelo

A pasta dos arquivos é determinada pela variável de ambiente `DOCUMENTOS_MODELO_DIR`. Em produção, ela deve apontar para a pasta que contém os modelos que devem ser publicados. Como fallback, o backend utiliza `LICITA.AI/modelos` no checkout do servidor e alguns caminhos legados conhecidos.

O endpoint `/files` retorna uma lista JSON com nome, caminho relativo, tamanho e URL de download. O endpoint `/files/{caminho}` valida o caminho antes de servir o arquivo e rejeita tentativas de `path traversal`.

O agregador possui CORS explícito para `https://danihmorais.github.io`, além de permitir origens adicionais configuradas em `CORS_ORIGINS`.

## 📂 Estrutura

```text
danihmorais.github.io/
├── index.html
├── documentos-modelo.html
├── main.py
├── MONTAEDITAL/
├── LICITA.AI/
├── EMAIL-ATAS-CONTRATOS/
├── GERADOREXTRATO/
├── FIORIILICSVTOWORD/
└── .github/workflows/
```

## 🚀 Desenvolvimento local

Cada aplicação React possui seu próprio `package.json`:

```powershell
cd GERADOREXTRATO   # ou MONTAEDITAL, LICITA.AI ou EMAIL-ATAS-CONTRATOS
npm install
npm run dev
```

Para o backend correspondente:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Para testar a API do agregador localmente:

```text
GET /health
GET /files
GET /files/<caminho-do-arquivo>
```

As páginas estáticas podem ser abertas diretamente no navegador. No GitHub Pages, `documentos-modelo.html` recebe o valor do secret `API_URL` durante o deploy.

## 📄 Licença

Distribuído sob a licença presente em [`LICENSE`](./LICENSE).

---

© 2026 danih.morais
