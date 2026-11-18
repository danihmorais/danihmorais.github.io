import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { loadTsModule, licitaPath } from "./source-loader.mjs";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function response({ ok = true, status = 200, json = {}, text = "" } = {}) {
  return {
    ok,
    status,
    async json() { return json; },
    async text() { return text || JSON.stringify(json); },
  };
}

function assertJsonEqual(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

test("mapearDadosWizard calcula o valor estimado e preserva defaults", () => {
  const { mapearDadosWizard } = loadTsModule("src/utils/mapearDados.ts");
  const dados = mapearDadosWizard({
    objeto: "Aquisição de materiais",
    necessidade: "Reposição de estoque",
    itens: [
      { numero: 1, descricao: "Caneta", un: "UN", qtd: 10, valor: 2.5 },
      { numero: 2, descricao: "Papel", un: "CX", qtd: 2, valor: 25 },
    ],
    secretarias: ["Secretaria de Administração"],
    contatosSecretarias: { "Secretaria de Administração": [{ email: "compras@example.com", tel: "1736931101" }] },
  });

  assert.equal(dados["{{OBJETO}}"], "Aquisição de materiais");
  assert.equal(dados["{{VALOR_ESTIMADO}}"].replace("\u00a0", " "), "R$ 75,00");
  assert.equal(dados["{{PAC}}"], "Não previsto: sem justificativa");
  assert.equal(dados["{{INSTRUMENTO}}"], "CONTRATO");
  assert.equal(dados["{{CRITERIOS}}"], "ITEM");
  assert.equal(dados["{{MODALIDADE}}"], "PREGAO_ELETRONICO");
  assert.equal(dados["{{PAGAMENTO}}"], "Pagamento até o 10º dia útil após a entrega, emissão da Nota Fiscal e aceite pelo setor Contábil.");
  assert.equal(dados["{{PRAZO REFAZIMENTO}}"], "5 dias úteis");
  assert.equal(dados["PAGAMENTO_TIPO"], "CONFORME_ENTREGAS");
});

test("mapearDadosWizard força critério por lote e envia a composição dos grupos", () => {
  const { mapearDadosWizard } = loadTsModule("src/utils/mapearDados.ts");
  const dados = mapearDadosWizard({
    criterio: "ITEM",
    motivoCriterio: "Itens da mesma categoria e fornecedores do mesmo ramo.",
    lotes: [{ id: "lote-1", nome: "Materiais de expediente" }],
    itens: [
      { id: 1, numero: 1, descricao: "Papel A4", loteId: "lote-1", lote: "Materiais de expediente", qtd: 10, valor: 25 },
      { id: 2, numero: 2, descricao: "Caneta azul", loteId: "lote-1", lote: "Materiais de expediente", qtd: 20, valor: 2 },
    ],
  });

  assert.equal(dados["{{CRITERIOS}}"], "LOTE");
  assert.equal(dados["{{MOTIVO_CRITERIO}}"], "Itens da mesma categoria e fornecedores do mesmo ramo.");
  assert.deepEqual(JSON.parse(dados.LOTES_DADOS), [{
    nome: "Materiais de expediente",
    itens: [
      { numero: 1, descricao: "Papel A4" },
      { numero: 2, descricao: "Caneta azul" },
    ],
  }]);
});

test("helpers de lotes validam atribuição integral e compatibilidade com dados legados", () => {
  const { obterLotes, obterLoteIdItem, distribuicaoLotesValida } = loadTsModule("src/utils/lotes.ts");
  const dados = {
    lotes: [{ id: "a", nome: "Material de expediente" }, { id: "b", nome: "Material de limpeza" }],
    itens: [
      { id: 1, numero: 1, loteId: "a", lote: "Material de expediente" },
      { id: 2, numero: 2, loteId: "b", lote: "Material de limpeza" },
    ],
  };
  assert.equal(obterLoteIdItem(dados.itens[0], obterLotes(dados)), "a");
  assert.equal(distribuicaoLotesValida(dados), true);
  assert.equal(distribuicaoLotesValida({ ...dados, itens: [dados.itens[0]] }), false);
  assert.equal(distribuicaoLotesValida({ ...dados, itens: [{ id: 1 }] }), false);
  assertJsonEqual(obterLotes({ itens: [{ lote: "Lote legado" }] }), [{ id: "legado:lote legado", nome: "Lote legado" }]);
});

test("llm usa endpoint tipado do backend sem enviar prompts ou configuração do modelo", async () => {
  let chamada = null;
  const storage = new MemoryStorage();
  const { gerarTextoIA } = loadTsModule("src/providers/llm.ts", {
    globals: {
      localStorage: storage,
      fetch: async (url, options) => {
        chamada = { url, options };
        return response({ json: { model: "modelo-backend", provider: "unsloth", content: "{\"resultado\":\"ok\"}" } });
      },
    },
  });

  const resultado = await gerarTextoIA("auditoria_marcas", {
    itens: [{ numero: "1", descricao: "Caderno Tilibra" }],
    instrucoes: "Preservar características.",
  });
  assertJsonEqual(resultado, { resultado: "ok" });
  assert.ok(chamada.url.includes("/licita/api/ia/item"));
  assert.equal("Authorization" in chamada.options.headers, false);
  const body = JSON.parse(chamada.options.body);
  assert.equal(body.tarefa, "auditoria_marcas");
  assert.deepEqual(body.itens, [{ numero: "1", descricao: "Caderno Tilibra" }]);
  assert.equal("prompt" in body, false);
  assert.equal("model" in body, false);
  assert.equal("temperature" in body, false);
  assert.equal("response_format" in body, false);
});

test("llm repete falha temporária e encerra em erro fatal", async () => {
  const respostas = [
    response({ ok: false, status: 503, text: "indisponível" }),
    response({ json: { model: "modelo-recuperado", content: "{\"ok\":true}" } }),
  ];
  let chamadas = 0;
  const modulo = loadTsModule("src/providers/llm.ts", {
    globals: {
      localStorage: new MemoryStorage(),
      setTimeout: (fn) => { fn(); return 0; },
      fetch: async () => { chamadas += 1; return respostas.shift(); },
    },
  });
  assertJsonEqual(await modulo.gerarTextoIA("melhorar_descricao", { descricao: "Cadeira", unidade: "UN" }), { ok: true });
  assert.equal(chamadas, 2);
});

test("index.html usa caminho relativo compatível com GitHub Pages", () => {
  const source = fs.readFileSync(licitaPath("index.html"), "utf8");
  assert.match(source, /src="\.\/src\/main\.tsx"/);
  assert.doesNotMatch(source, /src="\/src\/main\.tsx"/);
});

test("arquivos essenciais do LICITA.AI permanecem presentes", () => {
  for (const relativePath of [
    "index.html", "package.json", "package-lock.json", "vite.config.js", "src/main.tsx", "src/app.tsx",
    "src/api.ts", "src/providers/llm.ts", "src/providers/services/geradorIA.ts", "src/utils/mapearDados.ts",
    "main.py", "fila.py", "processador_docx.py",
  ]) assert.equal(fs.existsSync(licitaPath(relativePath)), true, `Arquivo ausente: ${relativePath}`);
});

test("mapearDadosWizard usa o texto fixo de pagamento mensal", () => {
  const { mapearDadosWizard } = loadTsModule("src/utils/mapearDados.ts");
  const dados = mapearDadosWizard({ pagamentoTipo: "MENSALMENTE", prazoRefazimentoDias: 12 });
  assert.equal(dados["{{PAGAMENTO}}"], "Pagamento será efetuado mensalmente, até o 10º dia útil após a prestação de serviços, emissão da Nota Fiscal e aceite pelo setor Contábil.");
  assert.equal(dados["{{PRAZO REFAZIMENTO}}"], "12 dias úteis");
});

test("gerarFasePreparatoria usa multipart e envia apenas dados estruturados", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    globals: {
      FormData: class {
        values = new Map();
        append(key, value, filename) {
          this.values.set(key, filename ? { value, name: filename } : value);
        }
        get(key) { return this.values.get(key); }
      },
      fetch: async (url, options) => {
        chamada = { url, options };
        return {
          ok: true,
          async json() {
            return { job_id: "d".repeat(32), status: "queued", email: "teste@example.com", message: "ok" };
          },
        };
      },
    },
  });

  const arquivo = {
    name: "DFD anterior.docx",
    size: 22,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  await modulo.gerarFasePreparatoria(
    {
      email: "teste@example.com",
      emailVerificationToken: "token-verificado",
      instrucoes: "Preservar as características do objeto.",
      dados_usuario: {
        modalidade: "PREGAO_ELETRONICO",
        itens: [],
      },
    },
    { dfd: arquivo },
  );

  assert.equal(chamada.url, "https://api.example.test/licita/api/gerar-fase-preparatoria");
  assert.equal(chamada.options.method, "POST");
  assert.equal("Content-Type" in (chamada.options.headers || {}), false);
  assert.equal(chamada.options.headers["X-Email-Verification"], "token-verificado");
  assert.equal(chamada.options.body.get("dfd").name, "DFD anterior.docx");
  const payload = JSON.parse(chamada.options.body.get("payload"));
  assert.equal(payload.email, "teste@example.com");
  assert.equal(payload.instrucoes, "Preservar as características do objeto.");
  assert.deepEqual(payload.dados_usuario, { modalidade: "PREGAO_ELETRONICO", itens: [] });
  assert.equal("dados_ia" in payload, false);
  assert.equal("__LICITA_PIPELINE__" in payload, false);
});

test("gerarFasePreparatoria envia pagamento por etapas como dados, sem montar prompts no navegador", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    globals: {
      fetch: async (url, options) => {
        chamada = { url, options };
        return {
          ok: true,
          async json() {
            return { job_id: "c".repeat(32), status: "queued", email: "teste@example.com", message: "ok" };
          },
        };
      },
    },
  });

  await modulo.gerarFasePreparatoria({
    email: "teste@example.com",
    emailVerificationToken: "token-verificado",
    instrucoes: "",
    dados_usuario: {
      pagamentoTipo: "POR_ETAPAS",
      pagamentoEtapas: "40% após a conclusão da etapa 1 e 60% após a etapa 2.",
      modalidade: "PREGAO_ELETRONICO",
      itens: [],
    },
  });

  const body = JSON.parse(chamada.options.body);
  assert.equal(chamada.options.headers["X-Email-Verification"], "token-verificado");
  assert.equal(body.dados_usuario.pagamentoTipo, "POR_ETAPAS");
  assert.match(body.dados_usuario.pagamentoEtapas, /40% após a conclusão/);
  assert.equal("dados_ia" in body, false);
});

test("gerarFasePreparatoria rejeita pagamento por etapas sem descrição", async () => {
  const modulo = loadTsModule("src/api.ts", {
    globals: {},
  });

  await assert.rejects(
    () => modulo.gerarFasePreparatoria({
      email: "teste@example.com",
      instrucoes: "",
      dados_usuario: {
        pagamentoTipo: "POR_ETAPAS",
        pagamentoEtapas: "   ",
        modalidade: "PREGAO_ELETRONICO",
        itens: [],
      },
    }),
    /pagamento por etapas/i,
  );
});

test("construirPrompt do TR não pede AMOSTRA_TR à IA quando a amostra não é exigida", () => {
  const { construirPrompt } = loadTsModule("src/providers/services/geradorIA.ts");
  const base = { "{{OBJETO}}": "Aquisição de materiais", "{{NECESSIDADE}}": "Reposição de estoque" };

  for (const dados of [base, { ...base, "{{AMOST}}": "nao" }]) {
    const prompt = construirPrompt(dados, false, "TR", "", true);
    assert.doesNotMatch(prompt, /AMOSTRA_TR/);
    assert.doesNotMatch(prompt, /Não há exigência de amostra/);
    assert.match(prompt, /"LOCAL": ""\n\}/);
    assert.match(prompt, /O campo EXECUCAO deve obrigatoriamente aprimorar|Elabore condições completas de execução/);
  }

  const comAmostra = construirPrompt({ ...base, "{{AMOST}}": "sim" }, false, "TR", "", true);
  assert.match(comAmostra, /"AMOSTRA_TR": ""/);
  assert.match(comAmostra, /AMOSTRA_TR: Detalhe a parte prática da exigência de amostra/);
});

test("construirPrompt prioriza as instruções específicas do usuário", () => {
  const { construirPrompt } = loadTsModule("src/providers/services/geradorIA.ts");
  const prompt = construirPrompt({ "{{OBJETO}}": "Aquisição de materiais", "{{NECESSIDADE}}": "Reposição de estoque" }, false, "ETP", "Justifique a necessidade de amostra.", true);
  const dados = prompt.indexOf("__LICITA_PIPE_DADOS_USUARIO__");
  const instrucoes = prompt.indexOf("INSTRUÇÕES DO USUÁRIO (OBRIGATÓRIAS");
  const schema = prompt.indexOf("ESTRUTURA JSON OBRIGATÓRIA:");
  assert.ok(dados >= 0 && instrucoes > dados && schema > instrucoes);
  assert.match(prompt, /aplique integralmente as INSTRUÇÕES DO USUÁRIO/);
  assert.doesNotMatch(prompt, /pesquisa na web/i);
  assert.doesNotMatch(prompt, /VALOR_ESTIMADO_APROXIMADO/);
});