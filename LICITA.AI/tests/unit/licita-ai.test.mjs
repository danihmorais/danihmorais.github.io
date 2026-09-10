import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { loadTsModule, licitaPath } from "./source-loader.mjs";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function response({ ok = true, status = 200, json = {}, text = "" } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
    async text() {
      return text || JSON.stringify(json);
    },
  };
}

test("mapearDadosWizard calcula o valor estimado e preserva os defaults", () => {
  const { mapearDadosWizard } = loadTsModule("src/utils/mapearDados.ts");
  const dados = mapearDadosWizard({
    objeto: "Aquisição de materiais",
    necessidade: "Reposição de estoque",
    itens: [
      { numero: 1, descricao: "Caneta", un: "UN", qtd: 10, valor: 2.5 },
      { numero: 2, descricao: "Papel", un: "CX", qtd: 2, valor: 25 },
    ],
    secretarias: ["Secretaria de Administração"],
    contatosSecretarias: {
      "Secretaria de Administração": [{ email: "compras@example.com", tel: "1736931101" }],
    },
  });

  assert.equal(dados["{{OBJETO}}"], "Aquisição de materiais");
  assert.equal(dados["{{VALOR_ESTIMADO}}"], "R$ 75,00");
  assert.equal(dados["{{PAC}}"], "Não previsto: sem justificativa");
  assert.equal(dados["{{INSTRUMENTO}}"], "CONTRATO");
  assert.equal(dados["{{CRITERIOS}}"], "ITEM");
  assert.equal(dados["{{MODALIDADE}}"], "PREGAO_ELETRONICO");
  assert.equal(dados["{{VIGENCIA}}"], "1 Meses");
  assert.equal(dados["{{CONTATOS_SECRETARIAS}}"], "Secretaria de Administração (compras@example.com - 1736931101)");
});

test("storageLocal nunca persiste a chave de API informada na configuração", () => {
  const storage = new MemoryStorage();
  const { lerConfigIA, salvarConfigIA } = loadTsModule("src/utils/storageLocal.ts", {
    env: {
      VITE_API_UNSLOTH_KEY: "build-unsloth-key",
      VITE_API_OPENROUTER_KEY: "build-openrouter-key",
    },
    globals: { localStorage: storage },
  });

  salvarConfigIA({ provedor: "unsloth", chave_api: "secret-do-usuario", modelo: "modelo-teste" });

  const salvo = JSON.parse(storage.getItem("licita_ai:config_ia"));
  assert.deepEqual(salvo, { provedor: "unsloth", modelo: "modelo-teste" });
  assert.equal("chave_api" in salvo, false);

  const config = lerConfigIA();
  assert.equal(config.provedor, "unsloth");
  assert.equal(config.chave_api, "build-unsloth-key");
  assert.equal(config.modelo, "modelo-teste");
});

test("storageLocal cai para OpenRouter quando não há chave Unsloth", () => {
  const storage = new MemoryStorage();
  const { lerConfigIA } = loadTsModule("src/utils/storageLocal.ts", {
    env: {
      VITE_API_UNSLOTH_KEY: "",
      VITE_API_OPENROUTER_KEY: "build-openrouter-key",
    },
    globals: { localStorage: storage },
  });

  assert.deepEqual(lerConfigIA(), {
    provedor: "openrouter",
    chave_api: "build-openrouter-key",
    modelo: "openrouter/free",
  });
});

test("llm aceita JSON cercado por markdown e informa o modelo resolvido", async () => {
  let chamadas = 0;
  let modeloResolvido = null;
  const storage = new MemoryStorage();
  const { gerarTextoOpenRouter } = loadTsModule("src/providers/llm.ts", {
    env: {
      VITE_API_URL: "",
      VITE_API_UNSLOTH_KEY: "",
      VITE_API_OPENROUTER_KEY: "test-openrouter-key",
    },
    globals: {
      localStorage: storage,
      fetch: async () => {
        chamadas += 1;
        return response({
          json: {
            model: "openrouter/modelo-real",
            choices: [{ message: { content: "```json\n{\"resultado\":\"ok\"}\n```" } }],
          },
        });
      },
    },
  });

  const resultado = await gerarTextoOpenRouter(
    "ETAPA: DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA.",
    "ignored",
    "openrouter/free",
    (model) => { modeloResolvido = model; }
  );

  assert.deepEqual(resultado, { resultado: "ok" });
  assert.equal(chamadas, 1);
  assert.equal(modeloResolvido, "openrouter/modelo-real");
});

test("llm corrige JSON com vírgula final e texto extra", async () => {
  const storage = new MemoryStorage();
  const { gerarTextoOpenRouter } = loadTsModule("src/providers/llm.ts", {
    env: {
      VITE_API_URL: "",
      VITE_API_UNSLOTH_KEY: "",
      VITE_API_OPENROUTER_KEY: "test-openrouter-key",
    },
    globals: {
      localStorage: storage,
      fetch: async () => response({
        json: {
          model: "modelo-teste",
          choices: [{ message: { content: "Resposta:\n{\"a\":1,}\nFim." } }],
        },
      }),
    },
  });

  assert.deepEqual(
    await gerarTextoOpenRouter("prompt", "ignored", "modelo-teste"),
    { a: 1 }
  );
});

test("llm repete falha temporária e não repete erro fatal", async () => {
  const storage = new MemoryStorage();
  const respostas = [
    response({ ok: false, status: 503, text: "indisponível" }),
    response({
      json: {
        model: "modelo-recuperado",
        choices: [{ message: { content: "{\"ok\":true}" } }],
      },
    }),
  ];
  let chamadasTemporarias = 0;
  const modulo = loadTsModule("src/providers/llm.ts", {
    env: {
      VITE_API_URL: "",
      VITE_API_UNSLOTH_KEY: "",
      VITE_API_OPENROUTER_KEY: "test-openrouter-key",
    },
    globals: {
      localStorage: storage,
      setTimeout: (fn) => { fn(); return 0; },
      fetch: async () => {
        chamadasTemporarias += 1;
        return respostas.shift();
      },
    },
  });

  assert.deepEqual(
    await modulo.gerarTextoOpenRouter("prompt", "ignored", "modelo-teste"),
    { ok: true }
  );
  assert.equal(chamadasTemporarias, 2);

  let chamadasFatais = 0;
  const moduloFatal = loadTsModule("src/providers/llm.ts", {
    env: {
      VITE_API_URL: "",
      VITE_API_UNSLOTH_KEY: "",
      VITE_API_OPENROUTER_KEY: "test-openrouter-key",
    },
    globals: {
      localStorage: new MemoryStorage(),
      setTimeout: (fn) => { fn(); return 0; },
      fetch: async () => {
        chamadasFatais += 1;
        return response({ ok: false, status: 400, text: "chave inválida" });
      },
    },
  });

  await assert.rejects(
    moduloFatal.gerarTextoOpenRouter("prompt", "ignored", "modelo-teste"),
    /chave inválida/
  );
  assert.equal(chamadasFatais, 1);
});

test("geradorIA monta os três estágios com contexto anterior e rejeita provedor desconhecido", async () => {
  let promptCapturado = "";
  const { processarDadosIA } = loadTsModule("src/providers/services/geradorIA.ts", {
    replacements: [
      [
        "import { gerarTextoOpenRouter } from '../llm';",
        "const { gerarTextoOpenRouter } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoOpenRouter: async (prompt, apiKey, model) => {
          promptCapturado = prompt;
          assert.equal(apiKey, "api-key");
          assert.equal(model, "modelo");
          return { JUSTIFICATIVA: "texto gerado" };
        },
      },
    },
  });

  const resultado = await processarDadosIA(
    {
      "{{OBJETO}}": "Aquisição de materiais",
      "{{NECESSIDADE}}": "Reposição de estoque",
      "{{MODALIDADE}}": "PREGAO_ELETRONICO",
      "{{CRITERIOS}}": "ITEM",
      "{{AMOST}}": "nao",
      "{{VIST}}": "nao",
      "RAW_EXECUCAO": "Entregar em até 10 dias úteis.",
      "INSTRUCOES_EXTRAS": "Preservar as informações do DFD.",
    },
    "api-key",
    "openrouter",
    true,
    "TR",
    "modelo"
  );

  assert.deepEqual(resultado, { JUSTIFICATIVA: "texto gerado" });
  assert.match(promptCapturado, /ETAPA: TERMO DE REFERÊNCIA/);
  assert.match(promptCapturado, /Entregar em até 10 dias úteis/);
  assert.match(promptCapturado, /Preservar as informações do DFD/);
  assert.match(promptCapturado, /REQUISITOS_ETP_ANTERIOR/);

  await assert.rejects(
    processarDadosIA({}, "api-key", "desconhecido", true, "DFD", "modelo"),
    /Provedor IA não suportado: desconhecido/
  );
});

test("api.ts monta o endpoint do agregador", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    env: { VITE_API_URL: "https://api.example.test/" },
    globals: {
      fetch: async (url, options) => {
        chamada = { url, options };
        return response({
          json: {
            job_id: "a".repeat(32),
            status: "queued",
            email: "teste@example.com",
            message: "ok",
          },
        });
      },
    },
  });

  const job = await modulo.gerarFasePreparatoria({ email: "teste@example.com" });
  assert.equal(job.status, "queued");
  assert.equal(chamada.url, "https://api.example.test/licita/api/gerar-fase-preparatoria");
  assert.equal(chamada.options.method, "POST");
  assert.equal(chamada.options.headers["Content-Type"], "application/json");
});

test("os arquivos principais do LICITA.AI permanecem presentes", () => {
  for (const relativePath of [
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "src/main.tsx",
    "src/app.tsx",
    "src/api.ts",
    "src/providers/llm.ts",
    "src/providers/services/geradorIA.ts",
    "src/utils/mapearDados.ts",
    "main.py",
    "fila.py",
    "processador_docx.py",
  ]) {
    assert.equal(fs.existsSync(licitaPath(relativePath)), true, `Arquivo ausente: ${relativePath}`);
  }
});
