# Gerador de Extrato de Atas e Contratos

Aplicação web para transformar PDFs de **Atas de Registro de Preços** e **Contratos** em extratos `.docx` padronizados.

## O que faz

- recebe vários PDFs de fornecedores em uma única operação;
- identifica, por documento, modalidade, instrumento e respectivos números;
- extrai processo, objeto, contratada, CNPJ, valor, assinatura e vigência;
- permite conferir e corrigir os dados antes da exportação;
- calcula a vigência final a partir da vigência inicial e do prazo extraído;
- gera um único DOCX com todos os extratos selecionados;
- oferece visualização do PDF lado a lado com os campos extraídos;
- possui modo claro/escuro.

### Extração de números

A identificação do número da **ATA/CONTRATO** é contextual. O backend procura primeiro o número explicitamente associado ao título do instrumento e, em seguida, nas linhas imediatamente posteriores. Números de processo ou modalidade que aparecem antes do título não são usados como fallback para o número do instrumento.

Isso é importante em documentos como:

```text
Processo nº 76/2025 – Pregão Presencial nº 46/2025
ATA DE REGISTRO DE PREÇOS
ATA nº 01/2026
```

Nesse caso, o número do instrumento é `01/2026`, e não `76/2025` ou `46/2025`.

> PDFs escaneados sem camada de texto continuam dependendo de OCR para uma extração automática confiável.

## Arquitetura

- **Frontend:** React + TypeScript + Vite.
- **Backend:** FastAPI + Python.
- **PDF:** `pypdf`.
- **DOCX:** `python-docx`.
- **Modelo:** `modelo/EXTRATO.docx`.
- **API:** `/api/analyze` e `/api/generate-docx`.

O `main.py` funciona como uma camada fina sobre `main_original.py`, substituindo apenas a estratégia de identificação do número do instrumento. Isso mantém o restante do pipeline de geração isolado.

## Desenvolvimento local

### Backend

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Frontend

```powershell
npm install
npm run dev
```

A URL da API pode ser definida por `VITE_API_URL`. Sem essa variável, o frontend usa `http://127.0.0.1:8000`.

## Fluxo de uso

1. informe setor, vigência inicial e data do extrato;
2. selecione um ou vários PDFs;
3. confira os campos identificados;
4. corrija manualmente qualquer campo que não tenha sido localizado;
5. clique em **Exportar DOCX**.

## Estrutura

```text
GERADOREXTRATO/
├── main.py                 # camada de extração contextual
├── main_original.py        # API e geração DOCX
├── modelo/EXTRATO.docx     # modelo de saída
├── src/                    # frontend React
├── requirements.txt        # dependências Python
└── package.json            # dependências e scripts do frontend
```
