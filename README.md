# 🏛️ Universo da Licitação

Hub de ferramentas web para automação de processos de **licitação pública municipal**, publicado via GitHub Pages.

🔗 **Site:** [danihmorais.github.io](https://danihmorais.github.io)

## 📦 Ferramentas

| Ferramenta | Finalidade |
|---|---|
| 🗂️ **[MontaEdital](./MONTAEDITAL)** | Elaboração da fase preparatória e montagem de editais a partir de modelos `.docx`. |
| 🤖 **[Licita.AI](./LICITA.AI)** | Geração assistida por IA de DFD, ETP e TR a partir dos dados do processo. |
| 📄 **[Conversor Fiorilli](./FIORIILICSVTOWORD)** | Conversão de relatórios `.txt`/`.csv` do Fiorilli para Word. |
| 📚 **[Documentos da Licitação](./documentos-modelo.html)** | Consulta, visualização, impressão e download dos documentos e vídeos disponibilizados pelo backend. |
| ✉️ **[Email ARPs/Contratos](./EMAIL-ATAS-CONTRATOS)** | Envio em lote de atas e contratos em PDF por e-mail. |
| 📑 **[Gerador de Extrato](./GERADOREXTRATO)** | Leitura de PDFs de atas/contratos e geração de extratos padronizados em DOCX. |

## 🧱 Arquitetura

O repositório reúne aplicações independentes em uma mesma publicação:

- **React + TypeScript + Vite:** MontaEdital, Licita.AI, Email ARPs/Contratos e Gerador de Extrato.
- **HTML/CSS/JS:** Conversor Fiorilli e página de Documentos da Licitação.
- **FastAPI/Python:** backends para processamento, análise de PDFs, geração/manipulação de `.docx` e entrega dos arquivos.
- **GitHub Actions:** build e publicação automática no GitHub Pages.

O backend agregador da raiz monta as aplicações FastAPI sob estes prefixos:

```text
/licita
/monta
/email
/geradorextrato
/estudos
```

A página de **Documentos da Licitação** usa a API de arquivos fornecida pelo backend. A configuração do endereço efetivo da API é aplicada somente durante a publicação por meio de segredo do GitHub; ela não é gravada como valor literal no código-fonte.

### Documentos da Licitação

A pasta dos arquivos é determinada preferencialmente pela variável de ambiente `DOCUMENTOS_LICITACAO_DIR`. `DOCUMENTOS_MODELO_DIR` continua aceito como alias para compatibilidade com a configuração existente. Como fallback, o backend verifica o diretório físico configurado no servidor e alguns caminhos conhecidos.

A API de arquivos retorna uma lista JSON com nome, caminho relativo, tamanho, tipo MIME e URL. O download individual valida o caminho antes de servir o arquivo e rejeita tentativas de `path traversal`.

Arquivos PDF são entregues com disposição `inline` para uso do visualizador do navegador. O parâmetro `?download=1` força `attachment` para o download. Arquivos de vídeo, incluindo `.mp4`, são servidos com suporte a requisições HTTP `Range`, permitindo reprodução por streaming sem precisar baixar o arquivo inteiro antes de iniciar.

O frontend oferece busca por nome/pasta, visualização de PDFs em modal, botão de impressão que abre o PDF no visualizador nativo do navegador, download direto e reprodução de vídeos com controles e tela cheia.

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
GET  /health
GET  /files
HEAD /files/<caminho-do-arquivo>
GET  /files/<caminho-do-arquivo>
GET  /files/<caminho-do-arquivo>?download=1
```

No GitHub Pages, a configuração da API é injetada automaticamente durante a publicação.

## 📄 Licença

Distribuído sob a licença presente em [`LICENSE`](./LICENSE).

---

© 2026 danih.morais
