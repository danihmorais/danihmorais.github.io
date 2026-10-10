# Painel administrativo do LICITA.AI

O botão **Pedidos** abre o painel administrativo para consultar solicitações, ver destinatários, datas, tempos de processamento, etapas, erros e histórico. Solicitações marcadas como falha podem ser refeitas sem apagar o registro original.

## Configuração obrigatória no servidor

O painel permanece desativado até que a senha seja configurada no ambiente do processo FastAPI. Não configure a senha em arquivos do frontend, variáveis VITE_*, no repositório ou em parâmetros enviados ao navegador.

1. No servidor, crie um arquivo privado para as variáveis de ambiente, por exemplo ~/.config/licita-ai/admin.env. O conteúdo deve conter duas linhas, com uma senha forte e um segredo aleatório distinto:

       LICITA_ADMIN_PASSWORD=COLOQUE_UMA_SENHA_FORTE_AQUI
       LICITA_ADMIN_TOKEN_SECRET=COLOQUE_UM_SEGREDO_ALEATORIO_DIFERENTE_AQUI

2. Gere um segredo aleatório separado para LICITA_ADMIN_TOKEN_SECRET, por exemplo com openssl rand -hex 32, e defina permissões restritivas para o arquivo (chmod 600 ~/.config/licita-ai/admin.env).

3. No arquivo da unidade systemd que executa a API do LICITA.AI, carregue esse arquivo com EnvironmentFile=%h/.config/licita-ai/admin.env. Crie o diretório antes, se necessário. Em seguida, reinicie a unidade existente para carregar as variáveis. O nome da unidade depende da instalação do servidor.

A senha é validada no backend. Após a autenticação, o navegador recebe um token assinado com validade padrão de 30 minutos. Os endpoints de listagem, detalhes e reexecução exigem esse token. O endpoint de login também possui limitação de tentativas.

## Retenção e reexecução

Por padrão, os JSONs da fila são mantidos por sete dias, conforme LICITA_QUEUE_RETENTION_DAYS. Os pedidos com falha conservam os dados de entrada, incluindo os documentos de referência extraídos, durante esse período para permitir uma reexecução. O painel omite conteúdo binário de imagens e abrevia textos extensos na visualização dos detalhes.

A opção **Refazer** cria um novo ID vinculado ao ID anterior; ela não apaga nem altera a falha original. Uma solicitação pode voltar a enviar um e-mail caso o servidor SMTP tenha aceitado a mensagem antes de ocorrer um erro de confirmação da entrega. O painel exibe esse aviso antes da confirmação.

A listagem apresenta até 300 registros por consulta. Os tempos são calculados a partir dos horários registrados pelo backend; solicitações antigas, anteriores à coleta dos históricos de etapa/tentativa, podem não ter todos os detalhamentos de duração.
