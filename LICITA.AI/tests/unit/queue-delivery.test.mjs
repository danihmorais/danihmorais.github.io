import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

test("download do ZIP utiliza token de status no cabeçalho", async () => {
  let chamada;
  const arquivo = new Blob(["conteudo do zip"], { type: "application/zip" });
  const api = loadTsModule("src/api.ts", {
    globals: {
      fetch: async (url, options) => {
        chamada = { url, options };
        return { ok: true, blob: async () => arquivo };
      },
    },
  });

  const resultado = await api.baixarZipFila("job-123", "status-secret");
  assert.equal(chamada.url, "https://api.example.test/licita/api/fila/job-123/download");
  assert.equal(chamada.options.headers["X-Status-Token"], "status-secret");
  assert.equal(await resultado.text(), "conteudo do zip");
});

test("reenvio de e-mail usa o token original e devolve novo acompanhamento", async () => {
  let chamada;
  const api = loadTsModule("src/api.ts", {
    globals: {
      fetch: async (url, options) => {
        chamada = { url, options };
        return {
          ok: true,
          async json() {
            return { job_id: "novo-job", status: "queued", status_token: "novo-token" };
          },
        };
      },
    },
  });

  const job = await api.reenviarFilaFasePreparatoria("job-123", "status-secret");
  assert.equal(chamada.url, "https://api.example.test/licita/api/fila/job-123/reenviar");
  assert.equal(chamada.options.method, "POST");
  assert.equal(chamada.options.headers["X-Status-Token"], "status-secret");
  assert.equal(job.job_id, "novo-job");
  assert.equal(job.status_token, "novo-token");
});

test("acompanhamento da fila é salvo apenas durante a sessão e pode ser descartado", () => {
  const itens = new Map();
  const sessionStorage = {
    getItem: (chave) => itens.get(chave) ?? null,
    setItem: (chave, valor) => itens.set(chave, valor),
    removeItem: (chave) => itens.delete(chave),
  };
  const api = loadTsModule("src/api.ts", {
    globals: { window: { sessionStorage } },
  });

  api.salvarAcompanhamentoJob("job-123", "status-secret");
  const salvo = api.recuperarAcompanhamentoJob();
  assert.equal(salvo.job_id, "job-123");
  assert.equal(salvo.status_token, "status-secret");
  api.limparAcompanhamentoJob();
  assert.equal(api.recuperarAcompanhamentoJob(), null);
});
