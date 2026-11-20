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

