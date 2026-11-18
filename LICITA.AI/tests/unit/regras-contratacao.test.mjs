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
test("limite ME/EPP acompanha configuração municipal carregada", () => {
  const config = loadTsModule("src/utils/configMunicipal.ts");
  const { exclusividadeMeeppPermitida, formatarLimiteMeepp } = loadTsModule("src/utils/regrasContratacao.ts");

  config.definirConfigMunicipal({
    municipio: { id: "teste", nome: "Município Teste", uf: "SP", display: "Município Teste/SP", decreto: "", campos: {} },
    limite_exclusividade_me_epp_centavos: 5000000,
  });

  assert.equal(exclusividadeMeeppPermitida([{ qtd: 1, valor: 50000 }]), true);
  assert.equal(exclusividadeMeeppPermitida([{ qtd: 1, valor: 50000.01 }]), false);
  assert.equal(formatarLimiteMeepp(), "R$ 50.000,00");

  config.definirConfigMunicipal({
    municipio: { id: "sao-francisco-sp", nome: "São Francisco", uf: "SP", display: "São Francisco/SP", decreto: "", campos: {} },
    limite_exclusividade_me_epp_centavos: 8000000,
  });
});
