import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

test("fila normal envia somente os dados estruturados e as instruções", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    globals: {
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

  const dadosUsuario = {
    "{{MODALIDADE}}": "PREGAO_ELETRONICO",
    "{{ITENS}}": JSON.stringify([{ numero: 1, descricao: "Notebook", un: "UN", qtd: 1, valor: 1000 }]),
  };
  await modulo.gerarFasePreparatoria({
    email: "teste@example.com",
    emailVerificationToken: "token-verificado",
    instrucoes: "Gerar com coerência global.",
    dados_usuario: dadosUsuario,
  });

  const body = JSON.parse(chamada.options.body);
  assert.equal(chamada.url, "https://api.example.test/licita/api/gerar-fase-preparatoria");
  assert.equal(chamada.options.headers["X-Email-Verification"], "token-verificado");
  assert.deepEqual(Object.keys(body).sort(), ["dados_usuario", "email", "instrucoes"]);
  assert.deepEqual(body.dados_usuario, dadosUsuario);
  assert.equal("dados_ia" in body, false);
  assert.equal("__LICITA_PIPELINE__" in body, false);
});

test("fila de contratação direta também delega a criação do pipeline ao servidor", async () => {
  let chamada = null;
  const modulo = loadTsModule("src/api.ts", {
    globals: {
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

  const dadosUsuario = {
    "{{MODALIDADE}}": "DISPENSA_BLL",
    "{{ITENS}}": JSON.stringify([{ numero: 1, descricao: "Notebook", un: "UN", qtd: 1, valor: 1000 }]),
  };
  await modulo.gerarFasePreparatoria({
    email: "teste@example.com",
    emailVerificationToken: "token-verificado",
    instrucoes: "Contratação direta.",
    dados_usuario: dadosUsuario,
  });

  const body = JSON.parse(chamada.options.body);
  assert.deepEqual(Object.keys(body).sort(), ["dados_usuario", "email", "instrucoes"]);
  assert.equal(body.dados_usuario["{{MODALIDADE}}"], "DISPENSA_BLL");
  assert.equal("dados_ia" in body, false);
});

