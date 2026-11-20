# LICITA.AI

Aplicação web para preparação de documentos de contratação pública, com interface React/Vite, API FastAPI, fila de processamento e integração com servidor de modelos compatível com a API OpenAI.

## Arquitetura

- `src/`: aplicação React, validação e interação com o usuário.
- `main.py`: API FastAPI do LICITA.AI, montada pelo agregador na rota `/licita`.
- `fila.py`: persistência e operações da fila em arquivos JSON.
- `fila_pipeline.py`: integração com o servidor de IA, controle de timeout e validação de respostas.
- `fila_pipeline_unificado.py`: worker, etapas da geração, persistência de resultados e montagem do ZIP.
- `pipeline_prompts.py`: templates de instrução mantidos no servidor. Dados do processo são enviados como conteúdo JSON, não como instruções de sistema.
- `processador_docx.py`: preenchimento dos modelos DOCX.
- `tests/backend` e `tests/unit`: testes de backend e front-end.

A fila mantém os arquivos JSON como espelho de recuperação e usa um índice SQLite em modo WAL para consultas por `job_id`, status e posição. O banco `queue.sqlite3` é criado automaticamente no diretório configurado em `LICITA_QUEUE_DIR`; os índices são reconstruídos a partir dos arquivos existentes quando necessário. O heartbeat atualiza o arquivo `.processing`; jobs abandonados são recuperados após o limite configurado. O worker continua usando os arquivos para claim e recuperação durante esta etapa de migração. Não compartilhe o diretório da fila entre servidores sem armazenamento e coordenação comuns.

## Configuração

Configure as variáveis no serviço do backend. Não grave senhas, chaves ou tokens no repositório.

### API e IA

| Variável | Finalidade |
| --- | --- |
| `API_UNSLOTH_URL` | URL do servidor de modelos compatível com OpenAI. |
| `API_UNSLOTH_KEY` | Chave de acesso ao servidor de modelos. |
| `AI_TIMEOUT_SECONDS` | Timeout geral das chamadas de IA. O valor recomendado para a configuração atual é 1200 segundos. |
| `VITE_API_URL` | URL-base da API usada na compilação do front-end. |

### SMTP e confirmação do destinatário

| Variável | Finalidade |
| --- | --- |
| `SMTP_HOST` | Servidor SMTP. |
| `SMTP_PORT` | Porta SMTP. |
| `SMTP_USERNAME` | Usuário de autenticação SMTP. |
| `SMTP_PASSWORD` | Senha SMTP. |
| `SMTP_FROM` | Endereço remetente dos e-mails. |
| `LICITA_EMAIL_ALLOWED_DOMAINS` | Lista opcional de domínios permitidos, separados por vírgula. Quando vazia, qualquer domínio com endereço sintaticamente válido é aceito. |

Os desafios e tokens de confirmação são persistidos no SQLite da fila. Cada token é consumido atomicamente na criação de um único pedido e fica associado ao respectivo `job_id`. O segredo é obrigatório e deve ter ao menos 32 caracteres; defina-o no ambiente do serviço antes de iniciar a API. O mesmo valor precisa permanecer estável entre reinícios e workers.

### Rate limit e proxy reverso

| Variável | Finalidade |
| --- | --- |
| `LICITA_TRUSTED_PROXY_CIDRS` | CIDRs dos proxies reversos confiáveis, separados por vírgula. Configure somente os endereços reais do proxy que conecta diretamente à API. |
| `LICITA_METRICS_TOKEN` | Token bearer obrigatório para acessar `/metrics`. Sem configuração, o endpoint permanece desativado. |
| `LICITA_IA_RATE_LIMIT` | Limite de chamadas pontuais por identidade de cliente, persistido no SQLite. |
| `LICITA_QUEUE_RATE_LIMIT` | Limite de criação de pedidos por IP, persistido no SQLite. |
| `LICITA_QUEUE_EMAIL_RATE_LIMIT` | Limite de criação de pedidos por e-mail, persistido no SQLite. |
| `LICITA_QUEUE_DIR` | Diretório de persistência dos jobs e arquivos ZIP, conforme `fila.py`. |

O endpoint `/metrics` exige `Authorization: Bearer <LICITA_METRICS_TOKEN>`. As métricas incluem contagem de jobs por status, duração e quantidade de execuções por etapa, falhas categorizadas, requisições HTTP e uso de tokens de IA. Não são expostos e-mails nem identificadores individuais de pedidos.

Não confie em `X-Forwarded-For` de clientes que não pertençam a `LICITA_TRUSTED_PROXY_CIDRS`. O Uvicorn também deve receber apenas os headers de proxy da infraestrutura confiável.

### Worker e retenção

| Variável | Finalidade |
| --- | --- |
| `LICITA_QUEUE_HEARTBEAT_SECONDS` | Intervalo do heartbeat de jobs em processamento. Padrão: 45 segundos. |
| `LICITA_QUEUE_STALE_PROCESSING_SECONDS` | Tempo sem heartbeat para considerar um job órfão. Padrão: 300 segundos. |
| `LICITA_QUEUE_SHUTDOWN_TIMEOUT_SECONDS` | Tempo máximo de espera para encerramento gracioso do worker. Padrão: 1250 segundos. |

Os arquivos da fila e os ZIPs precisam estar em volume persistente, com permissões de leitura e escrita para o usuário do serviço. O procedimento de backup deve incluir o diretório inteiro da fila, inclusive `queue.sqlite3`, `queue.sqlite3-wal`, `queue.sqlite3-shm` e os arquivos JSON. Antes de copiar o banco, prefira o mecanismo de backup do SQLite ou interrompa o serviço para garantir consistência.

## Fluxo de geração

1. O front-end envia e-mail, instruções e dados estruturados do formulário.
2. O backend exige que o endereço institucional seja confirmado por código enviado ao próprio e-mail.
3. O backend monta as etapas e prompts. O cliente não pode substituir o prompt ou o schema.
4. As chamadas de IA retornam dados estruturados em JSON Schema estrito.
5. DFD, ETP e TR são gerados em etapas separadas; ETP recebe DFD e TR recebe DFD e ETP.
6. O usuário pode acompanhar o job após recarregar a página, baixar o ZIP com o token de status no cabeçalho e solicitar reenvio somente quando os documentos já foram gerados e o envio SMTP falhou. Os ZIPs permanecem no diretório da fila até a rotina de retenção removê-los.

O worker monta os documentos DOCX e o ZIP. Falhas ao inserir tabelas ou imagens interrompem a geração.
7. O ZIP é enviado por e-mail e permanece disponível na fila durante o período de retenção para download autenticado.

Tokens de status e confirmação são enviados em cabeçalhos, não na URL. O token de status deve ser tratado como credencial: não o grave em logs nem o compartilhe.

## Importação de itens por planilha

Na etapa de itens, a interface aceita arquivos CSV e XLSX de até 5 MB, com limite de 1.000 itens. A primeira linha deve conter os cabeçalhos; a coluna de descrição é obrigatória. São reconhecidos sinônimos em português para número/item, descrição/especificação, unidade, quantidade e valor/preço unitário. O exemplo fica em `modelos/importacao-itens.csv`.

O parser converte as linhas para os campos `numero`, `descricao`, `un`, `qtd` e `valor`. Revise os itens importados e confira unidades, quantidades e valores antes de enviar a solicitação.

## Revisão dos documentos antes da montagem DOCX

A interface solicita a revisão do conteúdo estruturado antes de montar os DOCX. O job fica no estado `awaiting_review` e mantém os resultados de IA e os dados do processo no diretório persistente da fila.

- O endpoint `GET /api/fila/{job_id}/preview` entrega DFD, ETP e TR mediante `X-Status-Token`.
- O endpoint `PUT /api/fila/{job_id}/preview` salva alterações de campos já existentes e rejeita campos desconhecidos ou conteúdo vazio.
- O endpoint `POST /api/fila/{job_id}/preview/regenerar` regenera somente DFD, ETP ou TR selecionado, usando schema JSON estrito e contexto dos documentos anteriores.
- O endpoint `POST /api/fila/{job_id}/approve` reencaminha o mesmo job para a montagem DOCX. Os resultados das etapas são reutilizados e as chamadas anteriores de IA não são repetidas.

Uma edição ou regeneração do DFD marca ETP e TR como dependentes; uma edição ou regeneração do ETP marca TR como dependente. O botão de aprovação fica bloqueado até que esses documentos sejam regenerados. Pendências estruturais impeditivas — como campos obrigatórios vazios, marcadores não preenchidos, divergências dos documentos adicionais, incompatibilidade da amostra e marcos de pagamento não preservados — também impedem a aprovação. Quando restarem itens de conferência humana, o usuário deve marcar expressamente a confirmação no checklist; o backend recalcula o relatório e grava a confirmação junto ao job.

A verificação numérica da Lei 14.133/2021 sinaliza artigos fora do intervalo numérico 1 a 194, mas não verifica o teor, a vigência, a interpretação, a aplicabilidade nem a autenticidade de citações. As demais normas e jurisprudências continuam sujeitas à conferência em fonte primária. A revisão humana continua obrigatória.

## Desenvolvimento e testes

Na pasta `LICITA.AI`:

```bash
npm ci
npm test
npm run build
node tests/dist-smoke.mjs
```

Para o backend, instale as dependências de `requirements.txt` e execute:

```bash
python -m unittest discover -s tests/backend -p 'test_*.py' -v
```

O workflow `LICITA.AI checks` executa os testes front-end, build, smoke test e testes backend. Os workflows de publicação do Pages e deploy do FastAPI são acionados após o sucesso do workflow de validação na branch `main`.

## Deploy e rollback

1. Faça a alteração por branch e Pull Request.
2. Aguarde os jobs de validação concluírem com sucesso.
3. A publicação do Pages e o deploy do FastAPI são acionados a partir do SHA que passou nos testes.
4. Verifique o estado do deploy, `/health`, os namespaces da API e os headers CORS.
5. Em falha, interrompa novas publicações, restaure o último SHA conhecido como funcional e faça rollback do código pelo fluxo de deploy da infraestrutura. Preserve o diretório persistente da fila e os ZIPs; não remova jobs em processamento durante o rollback.

O repositório não contém segredos de deploy. O webhook de deploy e a URL pública da API permanecem configurados como secrets do GitHub Actions.


## Checklist automatizado de revisão documental

Na pré-visualização de DFD, ETP e TR, o LICITA.AI apresenta um checklist estrutural e de coerência com os dados do formulário. O ZIP da fase preparatória inclui:

- `RELATORIO_CONFORMIDADE.txt`: checklist legível, verificações e limites.
- `RELATORIO_CONFORMIDADE.json`: resultado estruturado para auditoria ou integração.
- `RELATORIO_REFERENCIAS_LEGAIS.txt`: campos estruturais, fontes com URL e referências a artigos identificadas; a checagem numérica é limitada e exige conferência humana.

O checklist identifica campos obrigatórios vazios, marcadores de preenchimento, diferenças entre documentos adicionais de habilitação no ETP e TR, referências legais que precisam de verificação humana, consistência da amostra e preservação de números/percentuais em pagamento por etapas. A pré-visualização também apresenta uma matriz assistiva dos 13 elementos do ETP (art. 18, § 1º, incluindo os elementos mínimos do § 2º) e dos 10 elementos do TR (art. 6º, XXIII), além de itens para revisão sobre análise de riscos, matriz de riscos, modo de disputa e pesquisa de preços. A matriz verifica a presença dos campos mapeados, não o mérito do conteúdo. A ferramenta não valida automaticamente vigência, texto, interpretação, pertinência ou legalidade. A revisão humana continua necessária.


## Configuração por município

O município ativo é selecionado pelo backend com `LICITA_MUNICIPIO_ID`; se a variável não estiver definida, usa `municipio_padrao` de `config/municipios.json`. A configuração inclui:

- Nome, UF, decreto, endereço, telefone e e-mail público do setor.
- Textos municipais para cláusulas e modelos de instruções.
- Limite ME/EPP em centavos, centralizado e retornado pela API pública `/api/configuracao`.
- Diretório e nomes dos modelos DOCX de DFD, ETP, TR e contratação direta.

Para cadastrar outro município, adicione um identificador em `config/municipios.json`, seus campos/textos e um diretório de modelos relativo à pasta LICITA.AI. Configure `LICITA_MUNICIPIO_ID` no serviço e reinicie o backend. O frontend carrega os dados públicos da API e usa o limite configurado para cálculos, mensagens e prompts. A configuração padrão permanece São Francisco/SP.


## Observabilidade e retry

O endpoint Prometheus `/metrics` expõe contadores de requisições HTTP e de completions de IA, duração acumulada e tokens de prompt/resposta/total quando o provedor informa `usage`. Os logs de etapa incluem job, request, etapa, modelo e duração, sem registrar prompts ou respostas integrais. Falhas de validação e geração de documentos são permanentes; timeout, conexão, HTTP 5xx e rate limit são retentáveis.
