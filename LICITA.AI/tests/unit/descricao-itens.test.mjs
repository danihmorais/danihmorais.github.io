import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

test("mapearDadosWizard envia os nomes de todos os itens para a auditoria", () => {
  const { mapearDadosWizard } = loadTsModule("src/utils/mapearDados.ts");
  const dados = mapearDadosWizard({
    objeto: "Aquisição de equipamentos",
    necessidade: "Atendimento da demanda",
    itens: [
      { numero: 1, descricao: "Notebook Lenovo ThinkPad E14", un: "UN", qtd: 1, valor: 1000 },
      { numero: 2, descricao: "Papel sulfite A4 75g", un: "CX", qtd: 2, valor: 20 },
    ],
  });

  assert.deepEqual(JSON.parse(dados.ITENS_NOMES), [
    { numero: 1, nome: "Notebook Lenovo ThinkPad E14" },
    { numero: 2, nome: "Papel sulfite A4 75g" },
  ]);
});

test("auditoria de marcas remove somente marca sem reescrever o descritivo", async () => {
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoIA: async () => ({
          itens: [
            {
              numero: 1,
              nome_revisado: "Notebook ThinkPad E14",
              motivo: "Marca comercial sem justificativa identificada: Lenovo.",
            },
            {
              numero: 2,
              nome_revisado: "Papel sulfite A4 75g",
              motivo: "Nenhuma marca identificada.",
            },
          ],
        }),
      },
    },
  });

  const resultado = await modulo.revisarMarcasItens(
    [
      { numero: 1, descricao: "Notebook Lenovo ThinkPad E14", un: "UN", qtd: 1, valor: 1000 },
      { numero: 2, descricao: "Papel sulfite A4 75g", un: "CX", qtd: 2, valor: 20 },
    ],
    "Não foi apresentada justificativa específica de marca.",
    "api-key",
    "modelo",
  );

  assert.equal(resultado.itens[0].descricao, "Notebook ThinkPad E14");
  assert.equal(resultado.itens[1].descricao, "Papel sulfite A4 75g");
  assert.equal(resultado.auditoria[0].alterado, true);
  assert.equal(resultado.auditoria[1].alterado, false);
});

test("auditoria rejeita uma reescrita que não seja mera remoção de marca", async () => {
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoIA: async () => ({
          itens: [
            {
              numero: 1,
              nome_revisado: "Computador portátil de alto desempenho",
              motivo: "Reescrita genérica.",
            },
          ],
        }),
      },
    },
  });

  const resultado = await modulo.revisarMarcasItens(
    [{ numero: 1, descricao: "Notebook Lenovo ThinkPad E14", un: "UN", qtd: 1, valor: 1000 }],
    "",
    "api-key",
    "modelo",
  );

  assert.equal(resultado.itens[0].descricao, "Notebook Lenovo ThinkPad E14");
  assert.equal(resultado.auditoria[0].alterado, false);
  assert.match(resultado.auditoria[0].motivo, /remoção isolada de marca/);
});

test("melhorarDescricaoItem trabalha somente com um item", async () => {
  let prompt = "";
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoIA: async (texto) => {
          prompt = texto;
          return { descricao: "Notebook portátil com tela de 15,6 polegadas" };
        },
      },
    },
  });

  const melhoria = await modulo.melhorarDescricaoItem(
    "Notebook tela 15,6",
    "UN",
    "Aquisição de equipamentos de informática",
    "Atendimento da demanda administrativa",
    "api-key",
    "modelo",
  );

  assert.equal(melhoria.descricao, "Notebook portátil com tela de 15,6 polegadas");
  assert.equal(melhoria.unidade, "UN");
  assert.match(prompt, /DESCRIÇÃO do item e verifique a coerência da UNIDADE/);
  assert.match(prompt, /A quantidade e o valor unitário não podem ser alterados/);
  assert.match(prompt, /Notebook tela 15,6/);
  assert.match(prompt, /UNIDADE ATUAL DO ITEM:/);
});

test("construirPromptAuditoriaMarcas mantém a auditoria restrita aos nomes dos itens", () => {
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: { __injected_llm: { gerarTextoIA: async () => ({}) } },
  });
  const prompt = modulo.construirPromptAuditoriaMarcas([
    { numero: 1, descricao: "Notebook Lenovo ThinkPad E14" },
  ], "");
  assert.match(prompt, /NÃO melhore redação/);
  assert.match(prompt, /Notebook Lenovo ThinkPad E14/);
  assert.match(prompt, /nome_revisado/);
});
