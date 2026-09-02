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
```

A página de **Documentos Modelo** consulta o endpoint `API_URL/files` do servidor e não depende mais dos arquivos armazenados neste repositório.

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

As páginas estáticas podem ser abertas diretamente no navegador. No GitHub Pages, `documentos-modelo.html` recebe o valor do secret `API_URL` durante o deploy.

## 📄 Licença

Distribuído sob a licença presente em [`LICENSE`](./LICENSE).

---

© 2026 danih.morais
