# 🏛️ Universo da Licitação

Hub de ferramentas web para automação de processos de **licitação pública municipal**, publicado via GitHub Pages.

🔗 **Site:** [danihmorais.github.io](https://danihmorais.github.io)

## 📦 Ferramentas

| Ferramenta | Finalidade |
|---|---|
| 🗂️ **[MontaEdital](./MONTAEDITAL)** | Elaboração da fase preparatória e montagem de editais a partir de modelos `.docx`. |
| 🤖 **[Licita.AI](./LICITA.AI)** | Geração assistida por IA de DFD, ETP e TR a partir dos dados do processo. |
| 📄 **[Conversor Fiorilli](./FIORIILICSVTOWORD)** | Conversão de relatórios `.txt`/`.csv` do Fiorilli para Word. |
| 📁 **[Documentos Modelo](./DOCUMENTOS%20MODELO)** | Catálogo de modelos, minutas e documentos usados nos processos licitatórios. |
| ✉️ **[Email ARPs/Contratos](./EMAIL-ATAS-CONTRATOS)** | Envio em lote de atas e contratos em PDF por e-mail. |
| 📑 **[Gerador de Extrato](./GERADOREXTRATO)** | Leitura de PDFs de atas/contratos e geração de extratos padronizados em DOCX. |

## 🧱 Arquitetura

O repositório reúne aplicações independentes em uma mesma publicação:

- **React + TypeScript + Vite:** MontaEdital, Licita.AI, Email ARPs/Contratos e Gerador de Extrato.
- **HTML/CSS/JS:** Conversor Fiorilli e Documentos Modelo.
- **FastAPI/Python:** backends para processamento, análise de PDFs e geração/manipulação de `.docx`.
- **GitHub Actions:** build e publicação automática no GitHub Pages.

O backend agregador da raiz monta as aplicações FastAPI sob estes prefixos:

```text
/licita
/monta
/email
/geradorextrato
```

### Gerador de Extrato

O Gerador de Extrato possui uma etapa específica de extração contextual para evitar confusão entre números de **processo**, **modalidade** e **instrumento**. Por exemplo, em um PDF que apresenta:

```text
Processo nº 76/2025 – Pregão Presencial nº 46/2025
ATA DE REGISTRO DE PREÇOS
ATA nº 01/2026
```

o número da ATA deve ser `01/2026`. A estratégia atual procura o número junto ao título do instrumento e nas linhas posteriores, sem usar números anteriores ao título como fallback.

## 📂 Estrutura

```text
danihmorais.github.io/
├── index.html
├── main.py
├── MONTAEDITAL/
├── LICITA.AI/
├── EMAIL-ATAS-CONTRATOS/
├── GERADOREXTRATO/
├── FIORIILICSVTOWORD/
├── DOCUMENTOS MODELO/
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

As páginas estáticas podem ser abertas diretamente no navegador.

## 📄 Licença

Distribuído sob a licença presente em [`LICENSE`](./LICENSE).

---

© 2026 danih.morais
