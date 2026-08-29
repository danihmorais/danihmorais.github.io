# Enviador de Atas e Contratos

Aplicação web para envio em lote de **Atas de Registro de Preços e Contratos em PDF** por e-mail.

Para cada documento, o backend identifica o destinatário no conteúdo do PDF, monta uma mensagem individual e envia o arquivo como anexo.

## Recursos

- processamento de vários PDFs;
- identificação automática do e-mail institucional;
- uma mensagem individual por documento/fornecedor;
- anexo do PDF correspondente;
- cópia ao remetente;
- preenchimento manual quando a leitura automática não encontrar o destinatário;
- configurações SMTP armazenadas somente no navegador quando o usuário opta por salvá-las.

## Execução local

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

Abra a URL indicada pelo Vite, normalmente `http://localhost:5173`.

## SMTP

Informe:

- servidor SMTP;
- porta;
- e-mail remetente;
- senha ou senha de aplicativo;
- tipo de segurança.

Exemplos comuns:

| Serviço | Servidor | Porta | Segurança |
|---|---|---:|---|
| Microsoft 365 | `smtp.office365.com` | 587 | STARTTLS |
| Gmail | `smtp.gmail.com` | 587 | STARTTLS |

A opção **Salvar configurações** mantém os dados no armazenamento local do navegador. A senha é enviada ao backend somente durante a operação SMTP.

## Limitação de PDFs escaneados

A identificação automática depende de uma camada de texto no PDF. Quando o documento é apenas uma imagem digitalizada, o destinatário pode não ser localizado. Nesse caso, o endereço pode ser conferido e preenchido manualmente antes do envio.
