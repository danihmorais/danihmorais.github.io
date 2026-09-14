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
});

test("storageLocal não expõe nem persiste credenciais de provedores", () => {
  const storage = new MemoryStorage();
  const { lerConfigIA, salvarConfigIA } = loadTsModule("src/utils/storageLocal.ts", { globals: { localStorage: storage } });
  salvarConfigIA({ provedor: "unsloth", chave_api: "secret-do-usuario", modelo: "modelo-teste" });
  const salvo = JSON.parse(storage.getItem("licita_ai:config_ia"));
  assertJsonEqual(salvo, { provedor: "openrouter", modelo: "modelo-teste" });
  assert.equal("chave_api" in salvo, false);
  const config = lerConfigIA();
  assert.equal(config.provedor, "openrouter");
  assert.equal(config.chave_api, "backend");
  assert.equal(config.modelo, "modelo-teste");
});

test("llm usa somente o proxy do backend e não envia Authorization do frontend", async () => {
  let chamada = null;
  const storage = new MemoryStorage();
  const { gerarTextoOpenRouter } = loadTsModule("src/providers/llm.ts", {
    globals: {
      localStorage: storage,
      fetch: async (url, options) => {
        chamada = { url, options };
        return response({ json: { model: "modelo-backend", provider: "unsloth", content: "{\"resultado\":\"ok\"}" } });
      },
    },
  });

  const resultado = await gerarTextoOpenRouter("prompt", "backend", "unsloth-auto");
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
  assertJsonEqual(await modulo.gerarTextoOpenRouter("prompt", "backend", "modelo"), { ok: true });
  assert.equal(chamadas, 2);
});

test("arquivos essenciais do LICITA.AI permanecem presentes", () => {
  for (const relativePath of [
    "index.html", "package.json", "package-lock.json", "vite.config.js", "src/main.tsx", "src/app.tsx",
    "src/api.ts", "src/providers/llm.ts", "src/providers/services/geradorIA.ts", "src/utils/mapearDados.ts",
    "main.py", "fila.py", "processador_docx.py",
  ]) assert.equal(fs.existsSync(licitaPath(relativePath)), true, `Arquivo ausente: ${relativePath}`);
});
