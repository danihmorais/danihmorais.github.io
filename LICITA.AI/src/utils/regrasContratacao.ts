function numeroDecimalLocal(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? "").trim().replace(/[R$\\s]/g, "");
  if (!texto) return 0;
  if (texto.includes(",")) texto = texto.replace(/\\./g, "").replace(",", ".");
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

export function paraCentavos(valor: unknown): number {
  return Math.round(numeroDecimalLocal(valor) * 100);
}

export function calcularTotalEmCentavos(itens: Array<{ valor?: unknown; valor_unitario?: unknown; valorUnitario?: unknown; qtd?: unknown; quantidade?: unknown }>): number {
  return itens.reduce((total, item) => {
    const valor = item.valor ?? item.valor_unitario ?? item.valorUnitario;
    const quantidade = numeroDecimalLocal(item.qtd ?? item.quantidade ?? 1);
    return total + Math.round(paraCentavos(valor) * quantidade);
  }, 0);
}

export const LIMITE_EXCLUSIVIDADE_MEEPP = 80000;

export const calcularValorEstimadoItens = (itens: any[] = []) => {
  return itens.reduce(
    (total: number, item: any) => total + (Number(item?.qtd) || 0) * (Number(item?.valor) || 0),
    0
  );
};

export const exclusividadeMeeppPermitida = (itens: any[] = []) => {
  return calcularValorEstimadoItens(itens) <= LIMITE_EXCLUSIVIDADE_MEEPP;
};

export const formatarLimiteMeepp = () => {
  return LIMITE_EXCLUSIVIDADE_MEEPP.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};
