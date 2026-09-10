import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

test("exclusividade ME/EPP respeita o limite de R$ 80.000,00", () => {
  const { LIMITE_EXCLUSIVIDADE_MEEPP, calcularValorEstimadoItens, exclusividadeMeeppPermitida } = loadTsModule("src/utils/regrasContratacao.ts");

  assert.equal(LIMITE_EXCLUSIVIDADE_MEEPP, 80000);
  assert.equal(calcularValorEstimadoItens([{ qtd: 8, valor: 10000 }]), 80000);
  assert.equal(exclusividadeMeeppPermitida([{ qtd: 8, valor: 10000 }]), true);
  assert.equal(exclusividadeMeeppPermitida([{ qtd: 8, valor: 10000.01 }]), false);
});
