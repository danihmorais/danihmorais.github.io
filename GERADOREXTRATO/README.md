# Gerador de Extrato de Ata e Contrato

Gera um único arquivo Word a partir de vários PDFs de atas/contratos. Cada PDF corresponde a um fornecedor e ocupa um extrato independente, com quebra de página entre os fornecedores.

## Extração automática

Para cada PDF, o backend procura:

- **DATA.ASS**: a data/hora `M` da última assinatura digital PDF encontrada; no exemplo, as duas assinaturas são identificadas e é usada a mais recente.
- **N.PROCESSO**: número do processo no formato `XX/XXXX`.
- **N.MODALIDADE**: número associado à modalidade detectada.
- **MODALIDADE**: detecta Pregão Eletrônico, Pregão Presencial, Dispensa, Concorrência Eletrônica, Concorrência Presencial ou Inexigibilidade.
- **OBJETO**: conteúdo à frente de `OBJETO:`.
- **CONTRATADA**: nome à frente de `CONTRATADA:`.
- **CNPJ**: segundo CNPJ distinto encontrado no documento.
- **VALOR**: primeiro tenta `Total do Proponente`; se não encontrar, procura `VALOR (R$)` na última página.
- **VIGÊNCIA**: número de meses localizado junto ao texto de vigência.

A interface permite conferir e corrigir os dados extraídos antes da geração.

## Campos informados pelo usuário

- Modalidade.
- Instrumento: Ata ou Contrato.
- Número do processo, com possibilidade de sobrescrever o valor extraído.
- Número da modalidade, com possibilidade de sobrescrever o valor extraído.
- Setor.
- **VIG.INICIAL**, em `DD/MM/AAAA`.
- **DATA.EXTRATO**, em `DD/MM/AAAA`.

A **VIG.FINAL** é calculada adicionando o prazo em meses de cada PDF à VIG.INICIAL.

## Modelos

A geração usa os modelos existentes em `DOCUMENTOS MODELO/Documentos Modelo`:

- `EXTRATO ATA.docx`
- `EXTRATO CONTRATO.docx`

Os placeholders são substituídos preservando a estrutura do modelo. Para cada fornecedor adicional, o conteúdo do modelo é copiado e precedido por `NextPage`/quebra de página.

## Execução local

Backend:

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Interface:

```bash
npm install
npm run dev
```

A interface local usa `http://localhost:8000/api` quando `VITE_API_URL` não está definido. No GitHub Pages, o workflow continua usando `VITE_API_URL` e o roteamento `/email/api` existente.

> PDFs escaneados sem camada de texto ou sem assinaturas digitais PDF estruturadas podem exigir conferência manual. O sistema não deve inventar dados ausentes.
