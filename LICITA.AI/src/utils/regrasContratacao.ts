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
