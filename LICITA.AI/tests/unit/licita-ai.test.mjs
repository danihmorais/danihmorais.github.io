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

test("llm usa somente o proxy do backend e não envia Authorization do frontend", async () => {
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

  const resultado = await gerarTextoIA("prompt", "backend", "unsloth-auto");
  assertJsonEqual(resultado, { resultado: "ok" });
  assert.match(chamada.url, /\/licita\/api\/ia\/chat$/);
  assert.equal("Authorization" in chamada.options.headers, false);
  const body = JSON.parse(chamada.options.body);
  assert.equal(body.model, "unsloth-auto");
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
  assertJsonEqual(await modulo.gerarTextoIA("prompt", "backend", "modelo"), { ok: true });
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

test("gerarFasePreparatoria usa multipart quando há documentos de referência", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
    ],
    globals: {
      __injected_gerador: { construirPrompt: () => "PROMPT_TESTE" },
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

  const arquivo = new File(["conteúdo de referência"], "DFD anterior.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await modulo.gerarFasePreparatoria(
    {
      email: "teste@example.com",
      instrucoes: "",
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
  assert.ok(chamada.options.body instanceof FormData);
  assert.equal(chamada.options.body.get("dfd").name, "DFD anterior.docx");
  const payload = JSON.parse(chamada.options.body.get("payload"));
  assert.equal(payload.email, "teste@example.com");
  assert.equal(payload.dados_ia.__LICITA_PIPELINE__.etapas.length, 1);
});

test("gerarFasePreparatoria cria etapa de IA somente para pagamento por etapas", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
    ],
    globals: {
      __injected_gerador: { construirPrompt: () => "PROMPT_TESTE" },
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
    instrucoes: "",
    dados_usuario: {
      pagamentoTipo: "POR_ETAPAS",
      pagamentoEtapas: "40% após a conclusão da etapa 1 e 60% após a etapa 2.",
      modalidade: "PREGAO_ELETRONICO",
      itens: [],
    },
  });

  const body = JSON.parse(chamada.options.body);
  const etapas = body.dados_ia.__LICITA_PIPELINE__.etapas;
  const pagamento = etapas.find((etapa) => etapa.id === "PAGAMENTO_ETAPAS");
  assert.equal(pagamento.tipo, "geracao_json");
  assert.match(pagamento.prompt, /40% após a conclusão/);
  assert.match(pagamento.prompt, /EXCLUSIVAMENTE JSON válido/);
});

test("gerarFasePreparatoria rejeita pagamento por etapas sem descrição", async () => {
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
    ],
    globals: {
      __injected_gerador: { construirPrompt: () => "PROMPT_TESTE" },
    },
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
