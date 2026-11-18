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
  let chamada = null;
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoIA: async (tarefa, dados) => {
          chamada = { tarefa, dados };
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
  assert.equal(chamada.tarefa, "melhorar_descricao");
  assert.equal(chamada.dados.descricao, "Notebook tela 15,6");
  assert.equal(chamada.dados.unidade, "UN");
  assert.equal(chamada.dados.objeto, "Aquisição de equipamentos de informática");
  assert.equal("prompt" in chamada.dados, false);
});

test("auditoria de marcas envia somente itens e justificativa como dados", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/providers/services/descricaoItensIA.ts", {
    replacements: [
      [
        'import { gerarTextoIA } from "../llm";',
        "const { gerarTextoIA } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoIA: async (tarefa, dados) => {
          chamada = { tarefa, dados };
          return { itens: [{ numero: "1", nome_revisado: "Notebook ThinkPad", motivo: "Marca removida." }] };
        },
      },
    },
  });
  await modulo.revisarMarcasItens(
    [{ numero: 1, descricao: "Notebook Lenovo ThinkPad" }],
    "Sem justificativa de marca.",
    "",
    "",
  );
  assert.equal(chamada.tarefa, "auditoria_marcas");
  assert.deepEqual(chamada.dados.itens, [{ numero: "1", descricao: "Notebook Lenovo ThinkPad" }]);
  assert.equal(chamada.dados.instrucoes, "Sem justificativa de marca.");
  assert.equal("prompt" in chamada.dados, false);
});
