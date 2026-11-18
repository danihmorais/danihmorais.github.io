import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./source-loader.mjs";

test("converte valores monetários brasileiros para centavos inteiros", () => {
  const modulo = loadTsModule("src/utils/regrasContratacao.ts");
  assert.equal(modulo.paraCentavos("R$ 1.234,56"), 123456);
  assert.equal(modulo.paraCentavos("32,50"), 3250);
  assert.equal(modulo.paraCentavos(12.34), 1234);
});

test("calcula o total dos itens sem acumular erros de ponto flutuante", () => {
  const modulo = loadTsModule("src/utils/regrasContratacao.ts");
  assert.equal(
    modulo.calcularTotalEmCentavos([
      { valor: "0,10", qtd: "3" },
      { valor: "0,20", qtd: "4" },
      { valor: "1.234,56", qtd: "2" },
    ]),
    247022,
  );
  assert.equal(modulo.calcularValorEstimadoItens([
    { valor: "0,10", qtd: "3" },
    { valor: "0,20", qtd: "4" },
  ]), 1.1);
});
