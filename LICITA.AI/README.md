# LICITA.AI

Aplicação web para preparação de documentos de contratação pública, com interface React/Vite, API FastAPI, fila de processamento e geração de texto exclusivamente pelo [OpenRouter](https://openrouter.ai).

## Arquitetura

- `src/`: aplicação React, validação e interação com o usuário.
- `main.py`: API FastAPI do LICITA.AI, montada pelo agregador na rota `/licita`.
- `fila.py`: persistência e operações da fila em arquivos JSON.
- `openrouter_client.py`: cliente único do OpenRouter (configuração, cabeçalhos e montagem do payload). Nenhum outro módulo conhece o formato da API.
- `fila_pipeline.py`: chamadas de IA da fila, controle de timeout, classificação de erros e validação de respostas.
- `fila_pipeline_unificado.py`: worker, etapas da geração, persistência de resultados e montagem do ZIP.
- `pipeline_prompts.py`: templates de instrução mantidos no servidor. Dados do processo são enviados como conteúdo JSON, não como instruções de sistema.
- `processador_docx.py`: preenchimento dos modelos DOCX.
- `tests/backend` e `tests/unit`: testes de backend e front-end.

A fila mantém os arquivos JSON como espelho de recuperação e usa um índice SQLite em modo WAL para consultas por `job_id`, status e posição. O banco `queue.sqlite3` é criado automaticamente no diretório configurado em `LICITA_QUEUE_DIR`; os índices são reconstruídos a partir dos arquivos existentes quando necessário. O heartbeat atualiza o arquivo `.processing`; jobs abandonados são recuperados após o limite configurado. O worker continua usando os arquivos para claim e recuperação durante esta etapa de migração. Não compartilhe o diretório da fila entre servidores sem armazenamento e coordenação comuns.

## Configuração

Configure as variáveis no serviço do backend. Não grave senhas, chaves ou tokens no repositório.

### API e IA

Toda a geração de IA usa o OpenRouter, sempre a partir do backend. A chave nunca é enviada ao navegador. Cada variável também aceita o prefixo `LICITA_` (por exemplo, `LICITA_OPENROUTER_API_KEY`), que tem precedência.

| Variável | Finalidade |
| --- | --- |
| `OPENROUTER_API_KEY` | Chave do OpenRouter. Obrigatória; sem ela as chamadas de IA falham e `/api/ia/status` retorna `ok: false`. |
| `OPENROUTER_MODEL` | Identificador do modelo (`provedor/modelo`). Padrão: `openrouter/auto`, que deixa o OpenRouter escolher e fixa o modelo escolhido para as demais etapas do mesmo pedido. Para qualidade e custo previsíveis, defina um modelo explícito que suporte `response_format` com schema JSON, `reasoning` e `tools`. |
| `OPENROUTER_BASE_URL` | URL-base da API. Padrão: `https://openrouter.ai/api/v1`. |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE` | Atribuição do aplicativo no OpenRouter (cabeçalhos `HTTP-Referer` e `X-Title`). |
| `OPENROUTER_REASONING_EFFORT` | Esforço de raciocínio das etapas com raciocínio: `minimal`, `low`, `medium` (padrão), `high` ou `xhigh`. Use `off` para não enviar `reasoning` (modelos sem suporte). Etapas mecânicas enviam `reasoning: {enabled: false}`. |
| `OPENROUTER_WEB_SEARCH` | `1` (padrão) ou `0`. Liga a ferramenta de servidor `openrouter:web_search` nas etapas de pesquisa (consulta de habilitação e chamadas sem schema); o modelo decide quando e o que pesquisar. A busca tem custo por requisição no OpenRouter. |
| `OPENROUTER_WEB_MAX_RESULTS`, `OPENROUTER_WEB_MAX_TOTAL_RESULTS`, `OPENROUTER_WEB_ENGINE` | Ajustes da busca. Padrões: 5 resultados por busca, 20 no total e engine escolhida pelo OpenRouter. |
| `OPENROUTER_REQUIRE_PARAMETERS` | `auto` (padrão), `true` ou `false`. Em `auto`, chamadas com schema JSON estrito enviam `provider.require_parameters`, para que o OpenRouter só use provedores que respeitam todos os parâmetros. Se o modelo escolhido não aceitar `temperature`, `reasoning` ou `tools` junto com o schema, o OpenRouter responde 404 (sem provedor disponível); nesse caso troque o modelo ou use `false`. |
| `OPENROUTER_DATA_COLLECTION` | `allow` ou `deny`. Com `deny`, só são usados provedores que não coletam dados. |
| `OPENROUTER_MAX_TOKENS` | Teto opcional de tokens de saída. Por padrão não é enviado. |
| `AI_TIMEOUT_SECONDS` | Timeout geral das chamadas de IA. O valor recomendado para a configuração atual é 1200 segundos. |
| `VITE_API_URL` | URL-base da API usada na compilação do front-end. |

As variáveis antigas `API_UNSLOTH_URL`, `API_UNSLOTH_KEY`, `LICITA_UNSLOTH_*`, `UNSLOTH_URL`, `AI_MODEL` e `UNSLOTH_MODEL` não são mais lidas. Pedidos gravados na fila antes da migração continuam processáveis: o nome de modelo `unsloth-auto` é tratado como o modelo configurado em `OPENROUTER_MODEL`.

Erros de configuração (HTTP 401, 402, 403 e 404 do OpenRouter) são tratados como permanentes e trazem orientação no `last_error` do pedido; timeout, HTTP 408/429/5xx e erros do provedor devolvidos com HTTP 200 são retentados.

### SMTP e destinatário

| Variável | Finalidade |
| --- | --- |
| `SMTP_HOST` | Servidor SMTP. |
| `SMTP_PORT` | Porta SMTP. |
| `SMTP_USERNAME` | Usuário de autenticação SMTP. |
| `SMTP_PASSWORD` | Senha SMTP. |
| `SMTP_FROM` | Endereço remetente dos e-mails. |
| `LICITA_EMAIL_ALLOWED_DOMAINS` | Lista opcional de domínios permitidos, separados por vírgula. Quando vazia, qualquer domínio com endereço sintaticamente válido é aceito. |

Não é exigida confirmação do endereço por código. O sistema valida o formato do e-mail e aplica a lista de domínios permitidos somente quando `LICITA_EMAIL_ALLOWED_DOMAINS` estiver configurada.

### Rate limit e proxy reverso

| Variável | Finalidade |
| --- | --- |
| `LICITA_TRUSTED_PROXY_CIDRS` | CIDRs dos proxies reversos confiáveis, separados por vírgula. Configure somente os endereços reais do proxy que conecta diretamente à API. |
| `LICITA_METRICS_TOKEN` | Token bearer obrigatório para acessar `/metrics`. Sem configuração, o endpoint permanece desativado. |
| `LICITA_IA_RATE_LIMIT` | Limite de chamadas pontuais por identidade de cliente, persistido no SQLite. |
| `LICITA_QUEUE_RATE_LIMIT` | Limite de criação de pedidos por IP, persistido no SQLite. |
| `LICITA_QUEUE_EMAIL_RATE_LIMIT` | Limite de criação de pedidos por e-mail, persistido no SQLite. |
| `LICITA_QUEUE_DIR` | Diretório de persistência dos jobs e arquivos ZIP, conforme `fila.py`. |
| `LICITA_QUEUE_RETENTION_DAYS` | Retenção padrão de arquivos de pedidos concluídos. Padrão: 7 dias. |
| `LICITA_QUEUE_REVIEW_RETENTION_DAYS` | Retenção dos pedidos em `awaiting_review`. Padrão: 30 dias e mínimo efetivo de 30 dias. |

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

## PDF.js e política de Content Security Policy

A importação de PDFs usa `@bundled-es-modules/pdfjs-dist` e fornece explicitamente o worker do navegador por `GlobalWorkerOptions.workerSrc`. O aviso de `eval` emitido pelo Rolldown vem do caminho de compatibilidade do worker para Node.js na dependência; no navegador, o PDF.js usa a URL do worker e o carregamento por script, sem depender desse caminho de `eval("require")`. Não adicione `'unsafe-eval'` à CSP apenas para suprimir esse aviso. A política de produção deve continuar restritiva e ser validada com a importação real de PDFs.

A versão instalada de `@bundled-es-modules/pdfjs-dist` é `3.6.172-alpha.1`, dentro da faixa afetada pelo [CVE-2024-4367](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq). O aviso oficial classifica o problema como execução de JavaScript arbitrário ao abrir PDF malicioso quando `isEvalSupported` permanece habilitado e indica `isEvalSupported: false` como mitigação; a correção definitiva está disponível a partir de `pdfjs-dist` `4.2.67`. A abertura de documentos agora usa essa mitigação. Planeje uma atualização controlada para uma versão oficial corrigida, validando worker, importação de PDFs e build antes de remover a opção.

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

O endpoint Prometheus `/metrics` expõe contadores de requisições HTTP e de completions de IA, duração acumulada e tokens de prompt/resposta/total quando o OpenRouter informa `usage`. Os logs de etapa incluem job, request, etapa, modelo e duração, sem registrar prompts ou respostas integrais. Falhas de validação e geração de documentos são permanentes; timeout, conexão, HTTP 5xx e rate limit são retentáveis.
