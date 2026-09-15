import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

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
}

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
  const modulo = loadTsModule("src/providers/services/contratacaoDiretaIA.ts", {
    replacements: [
      [
        'import { gerarTextoOpenRouter } from "../llm";',
        "const { gerarTextoOpenRouter } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoOpenRouter: async () => ({
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
  const modulo = loadTsModule("src/providers/services/contratacaoDiretaIA.ts", {
    replacements: [
      [
        'import { gerarTextoOpenRouter } from "../llm";',
        "const { gerarTextoOpenRouter } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoOpenRouter: async () => ({
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
  const modulo = loadTsModule("src/providers/services/contratacaoDiretaIA.ts", {
    replacements: [
      [
        'import { gerarTextoOpenRouter } from "../llm";',
        "const { gerarTextoOpenRouter } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoOpenRouter: async (texto) => {
          prompt = texto;
          return { descricao: "Notebook portátil com tela de 15,6 polegadas" };
        },
      },
    },
  });

  const descricao = await modulo.melhorarDescricaoItem(
    "Notebook tela 15,6",
    "Aquisição de equipamentos de informática",
    "Atendimento da demanda administrativa",
    "api-key",
    "modelo",
  );

  assert.equal(descricao, "Notebook portátil com tela de 15,6 polegadas");
  assert.match(prompt, /EXCLUSIVAMENTE a descrição do item/);
  assert.match(prompt, /Notebook tela 15,6/);
  assert.doesNotMatch(prompt, /Lápis/);
});

test("geração de contratação direta exige os sete campos específicos", async () => {
  let prompt = "";
  const modulo = loadTsModule("src/providers/services/contratacaoDiretaIA.ts", {
    replacements: [
      [
        'import { gerarTextoOpenRouter } from "../llm";',
        "const { gerarTextoOpenRouter } = __injected_llm;",
      ],
    ],
    globals: {
      __injected_llm: {
        gerarTextoOpenRouter: async (texto) => {
          prompt = texto;
          return {
            FUNDAMENTO_CONTRATACAO_DIRETA: "Art. 75, conforme fundamento informado no processo.",
            JUSTIFICATIVA_CONTRATACAO_DIRETA: "Justificativa da contratação direta.",
            INSTRUCAO_ART72: "Conferir a instrução processual antes da assinatura.",
            CRITERIOS_ESCOLHA_FORNECEDOR: "Critérios objetivos e documentação disponível.",
            CONDICOES_CONTRATACAO: "Condições conforme TR e proposta.",
            PUBLICIDADE_TRANSPARENCIA: "Providências de publicidade e transparência a conferir.",
            CONCLUSAO_CONTRATACAO_DIRETA: "Conclusão pela continuidade, condicionada à conferência processual.",
          };
        },
      },
    },
  });

  const resultado = await modulo.gerarDadosContratacaoDireta(
    { "{{OBJETO}}": "Aquisição de materiais", "{{MOTIVO_MODALIDADE}}": "Art. 75, fundamento informado" },
    { FASE_PREPARATORIA: { JUSTIFICATIVA: "texto anterior" } },
    "Justificar contratação direta.",
    "DISPENSA_BLL",
    "api-key",
    "modelo",
  );

  assert.equal(Object.keys(resultado).length, 7);
  assert.match(prompt, /Dispensa de Licitação com lances/);
  assert.match(prompt, /art\. 72/);
});

test("fila normal envia uma única etapa de IA para DFD, ETP e TR", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
      [
        'import { lerConfigIA } from "./utils/storageLocal";',
        'const { lerConfigIA } = __injected_storage;',
      ],
    ],
    globals: {
      __injected_gerador: {
        construirPrompt: (_dados, _meepp, etapa) => `PROMPT_${etapa}`,
      },
      __injected_storage: {
        lerConfigIA: () => ({ provedor: "openrouter", modelo: "modelo-teste" }),
      },
      fetch: async (url, options) => {
        chamada = { url, options };
        return {
          ok: true,
          async json() {
            return { job_id: "a".repeat(32), status: "queued", email: "teste@example.com", message: "ok" };
          },
        };
      },
    },
  });

  await modulo.gerarFasePreparatoria({
    email: "teste@example.com",
    instrucoes: "Gerar com coerência global.",
    dados_usuario: {
      "{{MODALIDADE}}": "PREGAO_ELETRONICO",
      "{{ITENS}}": JSON.stringify([{ numero: 1, descricao: "Notebook", un: "UN", qtd: 1, valor: 1000 }]),
    },
  });

  const body = JSON.parse(chamada.options.body);
  const etapas = body.dados_ia.__LICITA_PIPELINE__.etapas;
  assert.equal(chamada.url, "https://api.example.test/licita/api/gerar-fase-preparatoria");
  assert.equal(etapas.filter((etapa) => etapa.tipo === "geracao_unificada").length, 1);
  assert.deepEqual(etapas.filter((etapa) => etapa.tipo === "geracao_unificada").map((etapa) => etapa.id), ["FASE_PREPARATORIA"]);
  assert.equal(etapas.filter((etapa) => etapa.id === "DFD").length, 0);
  assert.equal(etapas.filter((etapa) => etapa.id === "ETP").length, 0);
  assert.equal(etapas.filter((etapa) => etapa.id === "TR").length, 0);
  assert.match(etapas.find((etapa) => etapa.id === "FASE_PREPARATORIA").prompt, /DFD/);
  assert.match(etapas.find((etapa) => etapa.id === "FASE_PREPARATORIA").prompt, /ETP/);
  assert.match(etapas.find((etapa) => etapa.id === "FASE_PREPARATORIA").prompt, /TR/);
});

test("fila de contratação direta não cria DFD, ETP ou TR", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
      [
        'import { lerConfigIA } from "./utils/storageLocal";',
        'const { lerConfigIA } = __injected_storage;',
      ],
    ],
    globals: {
      __injected_gerador: {
        construirPrompt: () => "PROMPT_TESTE",
      },
      __injected_storage: {
        lerConfigIA: () => ({ provedor: "openrouter", modelo: "modelo-teste" }),
      },
      fetch: async (url, options) => {
        chamada = { url, options };
        return {
          ok: true,
          async json() {
            return { job_id: "b".repeat(32), status: "queued", email: "teste@example.com", message: "ok" };
          },
        };
      },
    },
  });

  await modulo.gerarFasePreparatoria({
    email: "teste@example.com",
    instrucoes: "Contratação direta.",
    dados_usuario: {
      "{{MODALIDADE}}": "DISPENSA_BLL",
      "{{ITENS}}": JSON.stringify([{ numero: 1, descricao: "Notebook", un: "UN", qtd: 1, valor: 1000 }]),
    },
  });

  const body = JSON.parse(chamada.options.body);
  const etapas = body.dados_ia.__LICITA_PIPELINE__.etapas;
  assert.equal(etapas.filter((etapa) => etapa.id === "CONTRATACAO_DIRETA").length, 1);
  assert.equal(etapas.filter((etapa) => etapa.id === "DFD" || etapa.id === "ETP" || etapa.id === "TR" || etapa.id === "FASE_PREPARATORIA").length, 0);
});

void MemoryStorage;
