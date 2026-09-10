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

void MemoryStorage;

test("api preflight audita nomes e gera conteúdo específico antes de enfileirar contratação direta", async () => {
  let chamada = null;
  const storage = new MemoryStorage();
  const modulo = loadTsModule("src/api.ts", {
    env: { VITE_API_URL: "https://api.example.test/" },
    replacements: [
      [
        'import { MODELO_PADRAO_POR_PROVEDOR } from "./providers/llm";',
        'const { MODELO_PADRAO_POR_PROVEDOR } = __injected_llm;',
      ],
      [
        'import { revisarMarcasItens, gerarDadosContratacaoDireta } from "./providers/services/contratacaoDiretaIA";',
        'const { revisarMarcasItens, gerarDadosContratacaoDireta } = __injected_direta;',
      ],
      [
        'import { lerConfigIA } from "./utils/storageLocal";',
        'const { lerConfigIA } = __injected_storage;',
      ],
    ],
    globals: {
      __injected_llm: { MODELO_PADRAO_POR_PROVEDOR: { openrouter: "modelo-padrao" } },
      __injected_storage: { lerConfigIA: () => ({ provedor: "openrouter", chave_api: "chave", modelo: "modelo" }) },
      __injected_direta: {
        revisarMarcasItens: async (itens) => ({
          itens: [{ ...itens[0], descricao: "Notebook ThinkPad E14" }],
          auditoria: [{ numero: 1, alterado: true, nome_original: itens[0].descricao, nome_revisado: "Notebook ThinkPad E14" }],
        }),
        gerarDadosContratacaoDireta: async () => ({
          FUNDAMENTO_CONTRATACAO_DIRETA: "Art. 75",
          JUSTIFICATIVA_CONTRATACAO_DIRETA: "Justificativa",
        }),
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

  const dados = {
    email: "teste@example.com",
    instrucoes: "Sem justificativa de marca.",
    dados_usuario: {
      "{{MODALIDADE}}": "DISPENSA_BLL",
      "{{ITENS}}": JSON.stringify([
        { numero: 1, descricao: "Notebook Lenovo ThinkPad E14", un: "UN", qtd: 1, valor: 1000 },
      ]),
      ITENS_NOMES: JSON.stringify([{ numero: 1, nome: "Notebook Lenovo ThinkPad E14" }]),
    },
    dados_ia: { JUSTIFICATIVA: "DFD" },
  };

  await modulo.gerarFasePreparatoria(dados);
  const body = JSON.parse(chamada.options.body);
  const itens = JSON.parse(body.dados_usuario["{{ITENS}}"]);

  assert.equal(chamada.url, "https://api.example.test/licita/api/gerar-fase-preparatoria");
  assert.equal(itens[0].descricao, "Notebook ThinkPad E14");
  assert.equal(JSON.parse(body.dados_usuario.ITENS_NOMES)[0].nome, "Notebook ThinkPad E14");
  assert.match(body.dados_ia.ITENS_AUDITORIA_MARCAS, /Notebook Lenovo ThinkPad E14/);
  assert.equal(body.dados_ia.FUNDAMENTO_CONTRATACAO_DIRETA, "Art. 75");
});
