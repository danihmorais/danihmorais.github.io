import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./source-loader.mjs";

const modulo = loadTsModule("src/providers/llm.ts");
// O módulo roda em um contexto vm; normaliza para comparar sem diferença de protótipo.
const extrairEConverterJSON = (texto) => JSON.parse(JSON.stringify(modulo.extrairEConverterJSON(texto)));

test("JSON válido é convertido sem transformação", () => {
  assert.deepEqual(extrairEConverterJSON('{"A":"ok","B":2}'), { A: "ok", B: 2 });
});

test("texto anterior ao JSON é rejeitado", () => {
  assert.throws(() => extrairEConverterJSON('Plano: {{OBJETO}} e {x}.\\n{"A":"ok"}'), /JSON válido/);
});

test("bloco de pensamento antes do JSON é rejeitado", () => {
  assert.throws(() => extrairEConverterJSON('<think>rascunho {"A":"x"}</think>{"A":"final"}'), /JSON válido/);
});

test("cerca markdown é rejeitada", () => {
  assert.throws(() => extrairEConverterJSON('```json\\n{"A":"x"}\\n```'), /JSON válido/);
});

test("vírgula final é rejeitada em vez de reparada", () => {
  assert.throws(() => extrairEConverterJSON('{"A":"lista [1, ] fim, }","B":"x",}'), /JSON válido/);
});

test("escape inválido é rejeitado em vez de descartado", () => {
  assert.throws(() => extrairEConverterJSON('{"A":"C:\\Licita\\edital.docx"}'), /JSON válido/);
});

test("quebra de linha crua dentro de string é rejeitada", () => {
  assert.throws(() => extrairEConverterJSON('{"A":"linha1\nlinha2"}'), /JSON válido/);
});

test("texto sem JSON levanta erro de JSON inválido", () => {
  assert.throws(() => extrairEConverterJSON("sem json nenhum"), /JSON válido/);
});

test("prompt legado instrui \\n literal; prompts com json_schema não repetem a regra", async () => {
  const { readFileSync } = await import("node:fs");
  const api = readFileSync(new URL("../../src/api.ts", import.meta.url), "utf8");
  const gerador = readFileSync(new URL("../../src/providers/services/geradorIA.ts", import.meta.url), "utf8");
  // geradorIA.ts ainda alimenta a rota legada (json_object); o escape é imposto pela gramática nas demais.
  assert.match(gerador, /sequência JSON \\\\n \(uma/);
  assert.doesNotMatch(api, /sequência JSON \\\\n \(uma/);
});
