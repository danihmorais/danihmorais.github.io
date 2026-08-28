# Enviador de Atas e Contratos

Aplicação local para enviar instrumentos contratuais em PDF por e-mail. Para cada PDF, ela localiza o **segundo** campo `E-mail institucional`, usa o endereço seguinte como destinatário e envia uma mensagem individual com o arquivo anexado e cópia ao remetente.

## Como executar

Em dois terminais, dentro desta pasta:

```powershell
# Terminal 1 — backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

```powershell
# Terminal 2 — interface
npm install
npm run dev
```

Abra o endereço indicado pelo Vite, normalmente `http://localhost:5173`.

## Configuração SMTP

Informe servidor, porta, e-mail remetente, senha (ou senha de aplicativo) e o tipo de segurança. Exemplos comuns:

- Microsoft 365: `smtp.office365.com`, porta `587`, STARTTLS.
- Gmail: `smtp.gmail.com`, porta `587`, STARTTLS e uma senha de aplicativo.

O botão **Salvar configurações** é opcional. Quando ativado, os dados ficam exclusivamente no armazenamento local do navegador do usuário — nunca no servidor Render. A senha é encaminhada ao backend somente durante o envio SMTP.

> PDFs escaneados sem camada de texto não podem ter o e-mail detectado automaticamente. Nesses casos, basta preencher manualmente o destinatário exibido na lista antes do envio.
