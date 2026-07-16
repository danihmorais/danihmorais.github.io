# 🏛️ Universo da Licitação

Hub de ferramentas web para automação de processos de **licitação pública municipal**, publicado via GitHub Pages. Reúne, em um só lugar, sistemas para montagem de editais, geração de documentos com IA e conversão de relatórios.

🔗 **Site:** [danihmorais.github.io](https://danihmorais.github.io)

---

## 📦 Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| 🗂️ **[MontaEdital](./MONTAEDITAL)** | Sistema para elaboração da fase preparatória e montagem de editais (Pregão, Dispensa etc.), a partir de modelos `.docx`. |
| 🤖 **[Licita.AI](./LICITA.AI)** | Automatiza a criação de **DFD, ETP e TR** usando Inteligência Artificial (Gemini / OpenRouter) a partir dos dados do processo. |
| 📄 **[Conversor Fiorilli](./FIORIILICSVTOWORD)** | Converte relatórios `.txt`/`.csv` exportados do sistema Fiorilli em documentos Word (`.docx`), rodando 100% no navegador. |
| 📁 **[Documentos Modelo](./DOCUMENTOS%20MODELO)** | Página para navegar e baixar modelos, minutas e arquivos padrão usados nos processos licitatórios. |

---

## 🧱 Arquitetura

O projeto é composto por múltiplos front-ends independentes, unificados por uma página inicial (`index.html`) e, quando necessário, por um back-end Python:

- **Front-end:** React + TypeScript + Vite (MontaEdital e Licita.AI), além de páginas estáticas em HTML/CSS/JS puro (Conversor Fiorilli e Documentos Modelo).
- **Back-end:** FastAPI (Python), com `python-docx` e `lxml` para geração e manipulação de documentos `.docx`. O `main.py` na raiz monta os apps do MontaEdital e do Licita.AI sob os prefixos `/monta` e `/licita`.
- **Deploy:** GitHub Actions (`.github/workflows/static.yml`) builda o MontaEdital e o Licita.AI com Node/Vite, monta o site final na pasta `site/` e publica automaticamente no GitHub Pages a cada push na branch `main`.

```
danihmorais.github.io/
├── index.html                # Landing page (hub)
├── main.py                   # Monta os back-ends FastAPI (opcional/local)
├── MONTAEDITAL/               # App React + back-end FastAPI
├── LICITA.AI/                 # App React + back-end FastAPI
├── FIORIILICSVTOWORD/          # Página estática (gera .docx no browser)
├── DOCUMENTOS MODELO/          # Página estática de download de modelos
└── .github/workflows/          # Pipeline de deploy no GitHub Pages
```

---

## 🚀 Rodando localmente

Cada ferramenta React (`MONTAEDITAL/` e `LICITA.AI/`) tem seu próprio `package.json`:

```bash
cd MONTAEDITAL   # ou LICITA.AI
npm install
npm run dev
```

Para subir os back-ends Python:

```bash
cd MONTAEDITAL   # ou LICITA.AI
pip install -r requirements.txt
uvicorn main:app --reload
```

As páginas estáticas (Conversor Fiorilli e Documentos Modelo) podem ser abertas diretamente no navegador, sem build.

---

## 📄 Licença

Distribuído sob a licença presente em [`LICENSE`](./LICENSE).

---

© 2026 danih.morais
