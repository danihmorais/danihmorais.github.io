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





test("geração de contratação direta exige os sete campos específicos", async () => {
  let prompt = "";
  const modulo = loadTsModule("src/providers/services/contratacaoDiretaIA.ts", {
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
    ],
    globals: {
      __injected_gerador: {
        construirPrompt: (_dados, _meepp, etapa) => `PROMPT_${etapa}\nESTRUTURA JSON OBRIGATÓRIA:`,
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
  assert.deepEqual(etapas.map((etapa) => etapa.id), ["AUDITORIA_MARCAS", "CONSULTA_HABILITACAO", "FASE_PREPARATORIA"]);
  assert.equal(etapas.filter((etapa) => etapa.tipo === "geracao_unificada").length, 1);
  assert.equal(etapas.filter((etapa) => etapa.tipo === "geracao_json").length, 0);
  const consulta = etapas.find((etapa) => etapa.id === "CONSULTA_HABILITACAO");
  const geracao = etapas.find((etapa) => etapa.id === "FASE_PREPARATORIA");
  assert.equal(consulta.tipo, "consulta_habilitacao");
  assert.match(consulta.prompt, /DOCUMENTOS DE HABILITAÇÃO QUE JÁ SÃO SOLICITADOS/i);
  assert.match(geracao.prompt, /PROMPT_DFD/);
  assert.match(geracao.prompt, /PROMPT_ETP/);
  assert.match(geracao.prompt, /PROMPT_TR/);
  assert.match(geracao.prompt, /__LICITA_PIPE_CONSULTA_HABILITACAO__/);
});

test("fila de contratação direta não cria DFD, ETP ou TR", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    replacements: [
      [
        'import { construirPrompt } from "./providers/services/geradorIA";',
        'const { construirPrompt } = __injected_gerador;',
      ],
    ],
    globals: {
      __injected_gerador: {
        construirPrompt: () => "PROMPT_TESTE",
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
