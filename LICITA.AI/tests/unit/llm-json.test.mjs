import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./source-loader.mjs";

const modulo = loadTsModule("src/providers/llm.ts");
// O módulo roda em um contexto vm; normaliza para comparar sem diferença de protótipo.
const extrairEConverterJSON = (texto) => JSON.parse(JSON.stringify(modulo.extrairEConverterJSON(texto)));

test("preâmbulo com chaves não quebra a extração", () => {
  assert.deepEqual(extrairEConverterJSON('Plano: {{OBJETO}} e {x}.\n{"A":"ok"}'), { A: "ok" });
});

test("bloco <think> com JSON de rascunho é ignorado", () => {
  assert.deepEqual(extrairEConverterJSON('<think>rascunho {"A":"x"}</think>{"A":"final"}'), { A: "final" });
});

test("cerca de código markdown é removida", () => {
  assert.deepEqual(extrairEConverterJSON('```json\n{"A":"x"}\n```'), { A: "x" });
});

test("vírgula final não altera o conteúdo das strings", () => {
  assert.deepEqual(extrairEConverterJSON('{"A":"lista [1, ] fim, }","B":"x",}'), { A: "lista [1, ] fim, }", B: "x" });
});

test("barra inválida é preservada em vez de descartada", () => {
  assert.deepEqual(extrairEConverterJSON('{"A":"C:\\Licita\\edital.docx"}'), { A: "C:\\Licita\\edital.docx" });
});

test("quebra de linha crua dentro de string é escapada", () => {
  assert.deepEqual(extrairEConverterJSON('{"A":"linha1\nlinha2"}'), { A: "linha1\nlinha2" });
});

test("texto sem JSON levanta erro de JSON corrompido", () => {
  assert.throws(() => extrairEConverterJSON("sem json nenhum"), /corrompido/);
});

test("prompt legado instrui \\n literal; prompts com json_schema não repetem a regra", async () => {
  const { readFileSync } = await import("node:fs");
  const api = readFileSync(new URL("../../src/api.ts", import.meta.url), "utf8");
  const gerador = readFileSync(new URL("../../src/providers/services/geradorIA.ts", import.meta.url), "utf8");
  // geradorIA.ts ainda alimenta a rota legada (json_object); o escape é imposto pela gramática nas demais.
  assert.match(gerador, /sequência JSON \\\\n \(uma/);
  assert.doesNotMatch(api, /sequência JSON \\\\n \(uma/);
});
