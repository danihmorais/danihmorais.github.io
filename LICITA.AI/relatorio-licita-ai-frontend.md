Instruções para a IA executora: aplique na ordem P0 → P1 → P2. Cada item traz o problema, o local e a alteração exigida. Ao final de cada bloco, rode `npm run build` e os testes em `tests/`.

## Resumo

| Prio | Item | Seção |
|---|---|---|
| P0 | Imagem da dotação (base64) é enviada dentro do prompt da IA | 5.2 |
| P0 | Detalhes do pedido abrem no fim de uma lista de até 300 itens, fora da tela | 1 (A1) |
| P0 | Não existe cancelamento de pedidos pendentes | 2 |
| P0 | Modal de envio perde e-mail, instruções e anexos quando a geração dá erro | 4 (U2) |
| P0 | Etapas do topo não são clicáveis | 3 |
| P0 | `REQUISITOS_TR` depende de dado que nunca chega; ETP e TR saem incoerentes | 5.2 |
| P1 | Instruções do usuário entram só uma vez, no meio do prompt, com rótulo fraco | 5.1 |
| P1 | Prompt montado 3x com regras de saída contraditórias; dados repetidos 3x; nomes de marcas originais reaparecem | 5.2 |
| P1 | Resto dos problemas de painel e UI | 1, 4 |
| P2 | Acabamento, acessibilidade, bundle | 1, 4 |

---

## 1. Painel administrativo — falhas de layout e UX
Arquivos: `src/components/AdminPedidosModal.tsx`, `src/styles.css` (linhas 615–1021).

**A1 (P0) Detalhes abrem fora da tela.** O painel de detalhes (`.admin-detail-panel`, tsx linha 333) é renderizado **depois** de toda a lista. Clicar em "Detalhes" num pedido do topo não mostra nada visível e não há scroll automático.
Alteração: renderizar o detalhe expandido **logo abaixo do card clicado** (dentro do `.map`, após o `<article>` ou como filho dele) ou como drawer lateral fixo. Em qualquer caso, chamar `scrollIntoView({block:"nearest"})` ao abrir. Remover o botão duplicado "Fechar detalhes" ou manter só um.

**A2 (P0) [verificar] Lista pode ser espremida e cortada.** `.admin-pedidos-dialog` (css 626) é `display:flex; flex-direction:column; max-height; overflow:auto`, e `.admin-jobs-list` (css 739) tem `overflow:hidden`. Num flex em coluna com altura máxima, um filho com `overflow:hidden` encolhe até 0 em vez de fazer o diálogo rolar, cortando cards sem barra de rolagem.
Alteração: `.admin-pedidos-dialog{overflow:hidden}`; header e toolbar com `flex:none`; criar um único wrapper `.admin-body{flex:1 1 auto;min-height:0;overflow-y:auto}` contendo resumo, lista, avisos e detalhes. Remover `overflow:hidden` da lista (usar `border-radius` + `clip-path` ou `overflow:clip`).

**A3 (P1) Cabeçalho e barra de busca somem ao rolar.** Resolvido pela estrutura de A2 (só o `.admin-body` rola).

**A4 (P1) Login é pedido de novo a cada abertura.** O `token` vive no estado do modal, e o modal é desmontado ao fechar (`wizard.tsx` linha 283).
Alteração: subir `token` e `expiraEm` (usar `expires_in` de `autenticarAdminPedidos`) para o `Wizard` (memória, **sem** localStorage). Ao abrir, pular o login se o token ainda vale. Mostrar "Sessão expira em N min". No erro 401, voltar ao login com mensagem curta (hoje a detecção é por texto da mensagem, linhas 97/141/168; trocar por checagem de status HTTP: fazer `respostaAdmin` lançar um erro com `status`).

**A5 (P1) Sem atualização automática.** Pedidos `queued`/`processing` ficam desatualizados. Alteração: polling a cada 10 s enquanto houver pedido em fila/processamento e a aba estiver visível (`document.visibilityState`), sem fechar detalhes nem resetar scroll. Mostrar "Atualizado às HH:MM:SS".

**A6 (P1) Rótulos crus.** `rotuloStatus` (tsx 37) não cobre `retrying`, `unavailable`, `cancelled`; `current_stage` e `stage` aparecem como `FASE_PREPARATORIA`, `AUDITORIA_MARCAS`, `PAGAMENTO_ETAPAS`, `CONTRATACAO_DIRETA`, `GERACAO_DOCUMENTOS`, `ENVIO_EMAIL`. Alteração: mapa de rótulos amigáveis ("Geração de DFD/ETP/TR", "Auditoria de marcas", "Geração dos documentos", "Envio por e-mail"…), aplicado em cards, detalhe e histórico.

**A7 (P1) Nova tentativa agendada é invisível.** Após falha com tentativas restantes o pedido volta a `queued` com `retry_at` e `last_error`, e o card mostra só "Na fila". Alteração: se `status==="queued"` e `retry_at`, exibir "Nova tentativa às HH:MM (tentativa N de MAX)" e o último erro resumido. `_resumo_job_admin` (main.py 404) já devolve `retry_at`; acrescentar `max_attempts` (importar `MAX_ATTEMPTS` de `fila.py`).

**A8 (P2) Prévia de erro sem limite.** `.admin-job-error-preview` (css 808) usa `text-overflow:ellipsis` sem `white-space:nowrap`, então não faz efeito; erros de até 4000 caracteres expandem o card. Alteração: `display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow-wrap:anywhere`.

**A9 (P2) Tipografia e elementos mortos.** Há textos de 10–11 px (`.admin-detail-grid dt` 10px, `.admin-job-meta` 11px, `.admin-list-summary` 11px, histórico 11px, `code` 10px). Elevar para ≥12 px. `.prompt-eyebrow{display:none}` (css 425) esconde "ÁREA RESTRITA" e "DETALHES DO PEDIDO": exibir ou remover o markup. Padronizar `max-height` em `dvh` (admin usa `vh` e `96vh`, quebrando com a barra de endereço no celular).

**A10 (P2) Dados do formulário ilegíveis.** `resumirValor` (tsx 58) imprime objetos como JSON cru e `{{ITENS}}` como string JSON. Alteração: renderizar itens como tabela (nº, descrição, un, qtd, valor), ocultar chaves internas (`ITENS_NOMES`, `RAW_*`, `PAGAMENTO_ETAPAS_RAW`, `{{CAMINHO_IMAGEM_DOTACAO}}`) e mostrar a dotação como "N imagem(ns) + texto".

**A11 (P2) Refazer faz duas buscas.** `refazer` (tsx 150) altera `statusFiltro`/`busca` (dispara o `useEffect`) **e** chama `listarAdminPedidos` manualmente. Manter só uma.

**A12 (P2) Acessibilidade dos dois modais (admin e envio).** Faltam: fechar com `Esc`, focus trap, devolver o foco ao botão que abriu, `aria-describedby`. Fechar ao clicar no fundo (`onMouseDown` no overlay) descarta busca e, no modal de envio, dados digitados: desativar o fechamento por clique no fundo no modal de envio.

**A13 (P2) Copiar.** Botão "Copiar" ao lado do ID completo e do último erro.

---

## 2. Cancelar pedidos pendentes (ausente)
Hoje: nenhum endpoint, nenhum botão, nenhum status `cancelled`. Pedidos `queued` e `processing` só têm "Detalhes". O worker é uma thread única (`fila_pipeline_unificado.py`) e uma chamada de IA pode durar até 600 s, então um pedido em `processing` **não** pode ser interrompido no meio da chamada; só entre etapas.

### 2.1 Backend (`main.py`, `fila.py`, `fila_pipeline_unificado.py`)
1. `fila.py`: adicionar `cancel_job(job_id: str, origem: str) -> str`:
   - Se existir `{id}.json` (fila): `os.replace(_job_path(id), _job_path(id, ".cancelled"))` (atômico; se o worker pegou antes, dá `FileNotFoundError`). Depois regravar o JSON com `status="cancelled"`, `cancelled_at`, `cancelled_by=origem`, e retornar `"cancelled"`.
   - Senão, se existir `{id}.processing.json`: criar o marcador `QUEUE_DIR/{id}.cancel` (arquivo separado, porque o worker regrava o `.processing.json` a cada etapa e apagaria uma flag interna) e retornar `"cancelling"`.
   - Senão: levantar erro que vira HTTP 409 ("Só é possível cancelar pedidos na fila ou em processamento").
2. Incluir o sufixo `.cancelled` em: `_claim_next_job` (tupla de nomes ignorados, fila.py linha 416), `_find_job_path` (linha 135), `_listar_jobs_admin` (main.py `sufixos`, linha 490), e conferir `_queue_items` (main.py ~165–178, usado por `_queue_position`) para que pedidos cancelados não contem na posição da fila. Em `_limpar_fila_antiga` incluir `.cancel` e `.cancelled.json` na retenção (hoje só `.json` e `.zip`, então o marcador vazaria).
3. `fila_pipeline_unificado.py`: criar `class JobCancelado(Exception)` e `_checar_cancelamento(job)` (marcador existe → levanta). Chamar: antes de cada etapa do `for etapa in etapas` (linha 95), antes de `GERACAO_DOCUMENTOS` (linha 157) e **imediatamente antes de `_enviar_email`** (linha 174). Em `_process_one_job`, tratar `JobCancelado` **antes** do `except Exception`: finalizar etapa e tentativa como `cancelled`, `status="cancelled"`, gravar `.cancelled.json`, apagar `.processing.json`, o artefato `.artifact.zip` e o marcador; **não** reenfileirar e **não** enviar e-mail de alerta de falha. No bloco de retry (linha 238), se o marcador existir, cancelar em vez de reenfileirar.
4. `main.py`:
   - `POST /api/admin/jobs/{job_id}/cancel` (`_exigir_admin`) → `{job_id, status: "cancelled"|"cancelling", message}`.
   - `status_validos` (linha 540) ganha `"cancelled"`.
   - `_resumo_job_admin` devolve `cancel_requested` (marcador existe), `cancelled_at`, `cancelled_by`.
   - `refazer_pedido_admin` (linha 586) passa a aceitar `failed` **e** `cancelled`.
5. Endpoint público para o próprio usuário (P1): `POST /api/fila/{job_id}/cancelar?token=...` com `hmac.compare_digest` no `status_token`, mesma lógica, `origem="usuario"`.

### 2.2 Front-end
1. `api.ts`: `cancelarAdminPedido(token, jobId)` (POST `/licita/api/admin/jobs/{id}/cancel`) e, para o usuário, `cancelarFilaFasePreparatoria(jobId, statusToken)`. Incluir `"cancelled"` em `AdminJob.status`, e `cancel_requested?: boolean`.
2. `AdminPedidosModal.tsx`: botão **"Cancelar pedido"** (estilo secundário/perigo) em `.admin-job-actions` quando `status` for `queued` ou `processing`. Generalizar `confirmarRefazer` para `confirmacao: {tipo:"refazer"|"cancelar", id}` reutilizando `.admin-retry-confirm`. Textos:
   - fila: "O pedido será removido da fila e nenhum e-mail será enviado."
   - processando: "A IA não pode ser interrompida no meio de uma etapa. O cancelamento vale ao fim da etapa atual e nenhum e-mail será enviado."
   Estados: "Cancelando…" no botão; badge "Cancelamento solicitado" quando `cancel_requested`. Após sucesso, **uma** recarga da lista e aviso verde.
3. `rotuloStatus`: `cancelled → "Cancelado"`; `<option value="cancelled">Cancelados</option>` no filtro; CSS `.admin-status-cancelled{color:var(--text-muted)}` com borda tracejada para diferenciar de "Na fila"; botão "Refazer" também para `cancelled`.
4. Tela de sucesso (`wizard.tsx` 182–197): guardar `status_token`; botão "Cancelar solicitação" enquanto o status for `queued`/`processing` (ver U9).

### 2.3 Testes
Em `tests/backend/test_api.py` e `test_fila_pipeline.py`: cancelar pedido na fila (status `cancelled`, nunca processado); cancelar processando (marcador, termina `cancelled`, sem e-mail enviado, sem alerta); cancelar `sent`/`failed` → 409; corrida claim × cancel; refazer um `cancelled`; token inválido no endpoint público → 403.

---

## 3. Alternar entre fases clicando no menu superior
Hoje: `wizard.tsx` linhas 244–257 renderizam `<li>` sem ação. A navegação só existe por "Voltar"/"Próxima etapa". O estado "concluída" é `index < etapaAtual`, o que fica errado depois de voltar.

Alteração:
1. Extrair `validarEtapa` (linhas 82–110) para função pura `etapaValida(i:number, dados)`; calcular `const validas = etapas.map((_, i) => etapaValida(i, dados))` a cada render.
2. Estado novo `maiorEtapaAlcancada` (atualizado ao avançar). Função `irParaEtapa(alvo)`:
   - `alvo <= etapaAtual`: sempre permitido.
   - `alvo > etapaAtual`: permitido só se **todas** as etapas anteriores a `alvo` forem válidas. Se não, `showToast("Conclua a etapa X antes de avançar.", "info")` e levar o foco ao primeiro campo inválido, se possível.
3. Trocar o conteúdo de cada `<li>` por `<button type="button" className="stepper-button" onClick={() => irParaEtapa(index)}>` com `aria-current="step"` na atual, `aria-label="Etapa N: título"` (os rótulos ficam ocultos no celular, css 472) e `aria-disabled` nas bloqueadas.
4. Estados visuais: atual (preenchido); válida (✓); visitada com pendência (ponto/"!" em âmbar); bloqueada (opaca). Basear o ✓ em `validas[i]`, **não** em `index < etapaAtual`. CSS: reset de botão, `cursor:pointer`, `:hover`, `:focus-visible` com `var(--focus-ring)`, alvo de toque ≥ 36 px.
5. "Confeccionar documentos" (`avancar`, linha 114) só abre o modal se **todas** as 5 etapas forem válidas; caso contrário, ir para a primeira inválida com toast. Sem isso, o clique livre permite enviar com etapas vazias.
6. Não perder dados ao trocar de etapa (o estado já vive no `Wizard`, ok).

---

## 4. Demais problemas de UI do wizard
**U1 (P1) Troca de etapa não volta ao topo.** `useEffect` em `wizard.tsx` 78–80 chama `scrollRef.current?.scrollTo(0,0)`, mas `.wizard-form-content` não rola (css 189: só `min-height`); a página rola. A etapa 5, longa, abre rolada até o rodapé. Alteração: `document.getElementById("wizard-step-title")?.scrollIntoView({block:"start"})` ou `window.scrollTo({top:0})`, respeitando `prefers-reduced-motion`; mover o foco para o `<h1>`.

**U2 (P0) Modal de envio perde dados em caso de erro.** `confeccionarDocumentos` retorna a tela de status (linha 161, retorno antecipado), o que **desmonta** `PromptModal` e perde `email`, `texto` e `arquivos`; além disso `handleConfirmar` (promptModal.tsx 27–32) zera texto e arquivos antes de saber se deu certo. A mensagem "Seus dados preenchidos continuam disponíveis" é falsa para esses campos. Alteração: subir `email`, `instrucoes`, `arquivos` para o `Wizard`; limpar só após sucesso (ou por "Nova solicitação"); ao voltar do erro, reabrir o modal já preenchido.

**U3 (P1) Sem rascunho e sem proteção contra perda.** Tudo fica em memória; recarregar a página ou "Sair" (linha 119, `window.location.href="/"`) apaga as 5 etapas sem aviso. Alteração: salvar rascunho em `localStorage` (sem imagens base64 grandes; limite de tamanho; versão do schema), restaurar com banner "Retomar rascunho / Descartar"; `beforeunload` quando houver dados; confirmar em "Sair".

**U4 (P1) Condição de corrida em `step1.tsx` apaga edições.** `melhorarItem` (49–77) e `importarPdf` (128–195) esperam uma chamada assíncrona e depois fazem `atualizarDados({ ...dados, itens: ... })` com `dados` e `itens` **antigos** (fechamento do clique). Tudo que o usuário editou durante a espera (objeto, justificativa, outros itens) é sobrescrito. Alteração: `atualizarDados` do `Wizard` aceitar função (`setDados(prev => ...)`) e usar `atualizarDados(prev => ({ itens: prev.itens.map(...) }))`; nunca espalhar `...dados` em chamadas assíncronas. Desabilitar edição do item enquanto ele é melhorado.

**U5 (P1) Importar XLSX/PDF substitui todos os itens sem perguntar** (step1 117, 178). Alteração: se já houver itens, perguntar "Substituir" ou "Acrescentar ao final"; renumerar `numero` depois.

**U6 (P1) Erro vermelho antes de o usuário tocar no campo.** `step1.tsx` (210, 216, 241) e `JustificationBox` (`step5.tsx` 46) pintam borda e mensagem de erro já na primeira renderização. Alteração: estado `tocado` por campo (ou "tentou avançar") e só então mostrar o erro; no botão "Próxima etapa" desabilitado, informar o que falta ("Faltam: justificativa da demanda, 1 item sem valor").

**U7 (P1) Vigência sem limite.** `step5.tsx` título diz "Máximo 1 ano", mas `incrementarVigencia` (98) e o select permitem qualquer valor (ex.: 999 dias/anos). Alteração: validar no `etapaValida(4)` convertendo para dias (≤ 365 conforme a regra declarada) e desabilitar "+" no limite.

**U8 (P1) Ferramentas internas expostas a todos.** "Dados de teste" (wizard 210–226) e "Pedidos ↗" (229–232) aparecem para qualquer visitante; "↗" sugere link externo, mas abre modal. Alteração: exibir "Dados de teste" só com `import.meta.env.VITE_ENABLE_TEST_DATA==="true"`; mover o painel para rota/atalho próprio (`/#/admin` ou `?admin`) e retirar o botão do cabeçalho público.

**U9 (P1) Pós-envio sem acompanhamento.** O retorno traz `status_token`, mas é ignorado; `consultarFilaFasePreparatoria` (api.ts 35) nunca é chamada. A tela "Solicitação colocada na fila" é estática, e "Concluir" volta ao formulário **ainda preenchido** (risco de duplicar pedido). Alteração: guardar `status_token`, consultar a cada 10 s e exibir fila/etapa/concluído/falha; botão "Cancelar solicitação" (seção 2); botões "Nova solicitação (limpar formulário)" e "Voltar ao formulário".

**U10 (P2) Bundle.** `xlsx` e `pdfjs` são importados estaticamente em `step1.tsx` (linhas 3, 8–9) e entram no carregamento inicial. Trocar por `await import(...)` dentro de `importarXlsx`/`importarPdf`.

**U11 (P2) Estilo e acessibilidade dos formulários.** Estilos inline em todas as etapas, desfeitos por `!important` no CSS (ex.: css 225 força botões a 11 px; 210–211 forçam `h2` 15 px e `p` 12 px). Migrar para classes; texto de apoio ≥ 12–13 px. Radios sem `name` e `JustificationBox` com `<label>` sem `htmlFor`/sem envolver o `<textarea>`: associar rótulos e agrupar radios em `<fieldset><legend>`. Botão "✨ IA" (step1 243): usar texto claro ("Melhorar com IA").

**U12 (P2)** Rótulo "Não Exclusiva (Maior que R$ 80.000,00…)" (step5 169) repete o valor em texto fixo, enquanto o limite real vem de `LIMITE_EXCLUSIVIDADE_MEEPP`; usar `formatarLimiteMeepp()` também aqui.

---

## 5. Prompts

### 5.1 As instruções extras são usadas? Sim, mas mal
| Fluxo | Usa as instruções do modal? | Onde |
|---|---|---|
| Pregão/Dispensa comum (`FASE_PREPARATORIA`) | Sim, 1 vez | `api.ts:135`, anexadas **ao fim** do prompt do frontend. Depois o backend acrescenta dados atualizados, resultados e documentos de referência (`fila_pipeline_unificado.py:109-113`), então ficam **no meio** do prompt final, rotuladas só como "ADICIONAIS" |
| Contratação direta | Sim | `api.ts:74` (seção própria + regra 8) |
| Auditoria de marcas | Sim, como justificativa de marca | `descricaoItensIA.ts:105-106` |
| Pagamento por etapas | Não (correto) | usa só o texto de pagamento |
| Campo `INSTRUCOES_EXTRAS` / "INSTRUÇÕES COMPLEMENTARES OBRIGATÓRIAS" | **Nunca recebe a instrução do usuário** | `mapearDados.ts:76` lê `dados.instrucoesExtras`, que nunca é definido; e `prepararEspecificacao` (`api.ts:80`) sobrescreve com texto fixo ("Geração unificada…"), repetido 3x |

Problemas decorrentes: (a) a regra de `CORRELATAS_INTER` (`geradorIA.ts:35`) manda olhar "instruções extras", mas o bloco com esse nome contém só boilerplate; (b) rótulo "ADICIONAIS" tem peso menor que "OBRIGATÓRIAS"; (c) não há teste garantindo que a instrução chega ao prompt.

Alteração:
1. Em `construirPromptUnificado`, colocar logo após "DADOS DA CONTRATAÇÃO" a seção `INSTRUÇÕES DO USUÁRIO (OBRIGATÓRIAS — prevalecem sobre as diretrizes de estilo e de tamanho; não prevalecem sobre a legalidade nem sobre a regra de não inventar fatos):` e repetir uma linha de lembrete antes do schema JSON final.
2. Remover o parâmetro `INSTRUCOES_EXTRAS` fixo de `prepararEspecificacao` e de `mapearDados.ts:76`, ou passar a instrução real do usuário nele (uma só via, não duas).
3. Atualizar o texto de `CORRELATAS_INTER` para "salvo se as INSTRUÇÕES DO USUÁRIO indicarem outra correlata".
4. No backend, **não** acrescentar nada depois do prompt que enterre as instruções: documentos de referência vão **antes** da seção de instruções ou o bloco de instruções é repetido ao final.
5. Teste unitário (`tests/unit/licita-ai.test.mjs`): com instrução `"XYZ-TESTE"`, o prompt unificado e o de contratação direta devem conter `XYZ-TESTE` exatamente 1 vez na seção obrigatória (+ lembrete), e a auditoria deve recebê-la.

### 5.2 Defeitos que degradam a geração (corrigir primeiro)
**P0-a. Imagem da dotação vai para o LLM.** `mapearDados.ts:60-75` coloca `__IMG__<base64>` em `{{DOTACAO}}` e `{{CAMINHO_IMAGEM_DOTACAO}}`. O prompt serializa `dadosUsuario` inteiro (`api.ts:93`) **e** o backend serializa de novo (`fila_pipeline_unificado.py:110`). Resultado: dezenas a centenas de milhares de caracteres inúteis por imagem (base64), risco de estouro de contexto, lentidão e falhas. A checagem de 118 000 caracteres só roda quando há documentos de referência (linha 55) e nada limpa `__IMG__` (só `processador_docx.py` usa).
Alteração: criar `dadosParaPrompt(dados)` (TS) e `_dados_para_prompt(dados)` (Python) que remove `{{DOTACAO}}`, `{{CAMINHO_IMAGEM_DOTACAO}}`, qualquer valor que comece com `__IMG__`/`data:image`, e `{{CONTATOS_SECRETARIAS}}`; trocar a dotação por "Dotação informada (N imagem/ns e texto)" + o texto. Usar essa função em **todos** os prompts (unificado, direta, auditoria). Aplicar o limite de tamanho do prompt sempre, não só com anexos, com mensagem de erro clara.

**P0-b. `REQUISITOS_TR` quebrado.** `geradorIA.ts:41` manda enumerar "Documentos sugeridos no ETP: {{REQUISITOS_ETP_ANTERIOR}}", preenchido por `dadosUsuario["REQUISITOS_ETP_ANTERIOR"]`, que vem de `dados.requisitosEtpAnterior` (nunca definido) → sempre "Não informados." No fluxo unificado o ETP é gerado na mesma resposta, então o TR pode declarar "Não há documentos adicionais" mesmo que o ETP exija vários.
Alteração: no prompt unificado, instruir "enumere em REQUISITOS_TR exatamente os documentos adicionais que você listou em REQUISITOS_ETP neste mesmo JSON, numerados a partir do Documento 13"; melhor ainda, gerar `REQUISITOS_TR` por código a partir do JSON de `REQUISITOS_ETP` (pós-processamento no backend) ou separar em etapas (5.4).

**P0-c. Marcadores `__LICITA_PIPE_*` sem efeito.** `prepararEspecificacao` (`api.ts:82-85`) faz `.replace()` de marcadores que `construirPrompt` nunca emite. Código morto: remover. Em contrapartida, usar de verdade `__LICITA_PIPE_DADOS_USUARIO__` na seção de dados, para o backend injetar os dados **depois** da auditoria de marcas (hoje o modelo recebe os nomes originais, com marcas, no JSON do frontend e os revisados no bloco "DADOS ATUALIZADOS" do backend, e pode reintroduzir marcas no texto). Depois disso, apagar o bloco "DADOS ATUALIZADOS" em `fila_pipeline_unificado.py:110`.

**P1-d. Prompt triplicado com regras de saída contraditórias.** `construirPromptUnificado` embute três prompts completos (`prepararEspecificacao` ×3), cada um com `regrasGerais`, `basePrompt`, seu próprio schema JSON plano e "REGRAS RÍGIDAS DE SAÍDA", e depois pede um JSON aninhado diferente. São 3 cópias das regras gerais, 3 do `basePrompt`, 3 do JSON dos dados (+ 1 do backend). Alteração: refatorar `construirPrompt` para expor partes (`regrasGerais`, `basePrompt`, `diretrizEtapa(etapa)`, `regrasMinimas(etapa)`) e montar o unificado **uma vez**: regras gerais → dados (via marcador) → instruções do usuário → diretrizes e regras mínimas de DFD, ETP e TR → **um único** schema aninhado → regras de saída. Excluir das partes reaproveitadas qualquer "ESTRUTURA JSON" e "REGRAS RÍGIDAS".

**P1-e. "Pesquise na web" sem ferramenta.** `geradorIA.ts:95` ("Você pode chamar as 'tools'… Seu tempo máximo é de 600s…") e `REQUISITOS_ETP` ("Pesquise sobre documentos aplicáveis ao objeto na web", linha 25), mas `fila_pipeline._chamar_ia` não envia `tools`. O modelo pode simular pesquisa. Alteração: remover as duas frases (e a menção a 600 s); se quiser pesquisa, implementar ferramenta no backend.

**P1-f. Instruções que induzem fatos falsos.**
- `ESTIMATIVA_QUANTIDADES` (linha 23): "Como você não sabe os itens, deve sempre tentar dizer que foi considerada a estimativa de quantidades do processo anterior mais recente". Além de contradizer o fato de os itens estarem no prompt, manda afirmar um processo anterior que pode não existir. Alteração: usar essa afirmação **somente** se houver documento de referência anexado (o backend sabe); caso contrário, "fundamentar nas quantidades informadas pela unidade demandante e no consumo/necessidade descritos".
- `VALOR_ESTIMADO_APROXIMADO` (linha 50): pede "algum valor aproximado" ao modelo, quando o valor exato já é calculado (`{{VALOR_ESTIMADO}}`). Alteração: remover do JSON pedido à IA e preencher no backend com o valor calculado (ou instruir "reproduza exatamente R$ X").
- `SUBCONTRATACAO_ETP` (linha 26): redação truncada ("sempre será que não é permitido"). Corrigir para "sempre vedada, com justificativa".
- Não renomear chaves de template (ex.: `OBRIGACOES_CONTRANTE`), pois são variáveis dos `.docx`.

**P1-g. Chamada gigante e frágil.** Um único JSON com 32 campos, muitos de 3–10 parágrafos, com `enable_thinking:true`, sem `max_tokens` (`fila_pipeline.py:173-181`) e timeout de 600 s. Risco de truncamento e de perder tudo numa falha. O backend já suporta etapas retomáveis (`completed_stages`) e marcadores `__LICITA_PIPE_DFD__`/`__LICITA_PIPE_ETP__`. Alteração: dividir em 3 etapas sequenciais (`DFD` → `ETP` → `TR`, tipo `geracao_json`), com ETP recebendo `__LICITA_PIPE_DFD__` e TR recebendo `__LICITA_PIPE_ETP__` (isso também resolve P0-b). Estender o anexo de instruções e de documentos de referência (`fila_pipeline_unificado.py:109`) a esses tipos de etapa (hoje só `geracao_unificada` e `geracao_contratacao_direta`). Definir `max_tokens` explícito [verificar o limite do servidor Unsloth]. Ajustar o loop final (linha 148), que já mescla blocos planos.

### 5.3 Qualidade jurídica dos textos (melhorar prompts)
1. **Jurisprudência inventada:** o prompt manda "observar jurisprudência do TCU/TCE-SP" sem proibir citações falsas. Acrescentar regra: "Cite acórdão, súmula ou processo **apenas** se constar nesta instrução ou se você tiver certeza do número e do ano; caso contrário descreva o entendimento sem numerá-lo. Nunca invente número de acórdão, artigo ou parecer."
2. **Fundamentação por campo:** em cada regra mínima trocar só "N parágrafos" por estrutura verificável: (i) fato extraído dos dados informados, (ii) dispositivo legal específico (ex.: art. 18, §1º, e art. 40 da Lei 14.133/2021, conforme o campo), (iii) consequência prática/risco. Acrescentar "cada parágrafo deve citar ao menos um dado concreto da contratação (objeto, item, quantidade, prazo, unidade demandante)", para eliminar texto genérico que serviria a qualquer processo.
3. **Coerência cruzada** (checklist no fim do prompt): modalidade, critério de julgamento, vigência, amostra/vistoria, ME/EPP e forma de pagamento devem ser descritos igual no DFD, ETP e TR; se um campo contradiz os dados do formulário, os **dados do formulário vencem**.
4. **Proibir marcadores de preenchimento** ("XXXXX", "[inserir]") no texto, exceto onde o template exigir; hoje `AMOSTRA_TR` traz "Departamento de XXXXXXXXX" no exemplo e o modelo pode copiar.
5. **Formato de saída:** a exigência de `\\n` escapado dentro das strings JSON é fonte de JSON corrompido (hoje remendado por `_extrair_json`). Se o servidor Unsloth suportar schema (`json_schema` ou gramática) [verificar], enviar o schema no lugar de só `{"type":"json_object"}` (`fila_pipeline.py:177`). Manter o reparo do `_extrair_json` como rede de segurança.
6. **Temperatura:** 0,3 é adequada para os textos; usar 0 na auditoria de marcas e na revisão do pagamento por etapas.

### 5.4 Prompts menores
- **Auditoria de marcas** (`descricaoItensIA.ts:92`): incluir 3 exemplos curtos (marca removida; marca mantida por justificativa; nome genérico sem alteração) e lista de falsos positivos comuns (nomes genéricos populares usados como substantivo comum só devem sair se houver marca inequívoca). Rodar com temperatura 0. Já existe validação por remoção de tokens; manter.
- **Pagamento por etapas** (`api.ts:49`): sem alterações de regra; passar `temperature:0`.
- **Contratação direta** (`api.ts:72`): usar `dadosParaPrompt` (P0-a), colocar as instruções do usuário com o mesmo rótulo "OBRIGATÓRIAS", e acrescentar à regra 2 que, se a instrução do usuário informar o fundamento, ele deve ser reproduzido sem reinterpretação.
- **Melhorar descrição do item** (`descricaoItensIA.ts:169`): sem problemas de lógica; opcionalmente exibir ao usuário o motivo da alteração de unidade.

### 5.5 Testes de prompt a criar
Em `tests/unit/`: (1) o prompt unificado não contém `__IMG__`, `data:image` nem `__LICITA_PIPE_` residual; (2) contém a instrução do usuário 1x na seção obrigatória; (3) contém **uma** estrutura JSON final (contar ocorrências de `ESTRUTURA JSON`); (4) tamanho do prompt sem anexos < 40 000 caracteres com 30 itens; (5) não contém "tools" nem "pesquise na web"; (6) `VALOR_ESTIMADO_APROXIMADO` não é pedido à IA. Em `tests/backend/`: cenário com dotação em imagem não aumenta o prompt; nomes de itens do prompt são os pós-auditoria.

---

## 6. Ordem sugerida de execução
1. Seção 5.2 (P0-a, b, c) e 5.1 — corrige a causa de documentos fracos e falhas de contexto.
2. Seção 4 U2 e U4 — evitam perda de dados do usuário.
3. Seção 3 (stepper clicável) e U1.
4. Seção 2 (cancelamento) — backend primeiro, depois UI.
5. Seção 1 (A1, A2, A4–A7) e resto de P1/P2.
6. Seção 5.2 P1-d/g (refatoração do prompt em etapas) com os testes de 5.5.

### Critérios de aceite
- Abrir "Detalhes" de qualquer pedido mostra o conteúdo na tela sem rolar manualmente; cabeçalho e filtros permanecem visíveis com 300 pedidos.
- Pedido `queued` cancelado nunca é processado nem gera e-mail; pedido `processing` cancelado termina `cancelled` sem e-mail e sem alerta de falha.
- Clicar em qualquer etapa já concluída volta a ela sem perder dados; avançar por clique só funciona se as anteriores forem válidas; o envio exige as 5 etapas válidas.
- Um erro de geração devolve o usuário ao modal com e-mail, instruções e anexos intactos.
- O prompt enviado à IA não contém base64, tem uma só estrutura JSON, mostra os nomes de itens pós-auditoria e inclui a instrução do usuário na seção obrigatória.
- `npm run build` e todos os testes (`tests/unit`, `tests/backend`) passam.
