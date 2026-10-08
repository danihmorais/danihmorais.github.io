export interface ItemCotacaoPdf {
  numero: number;
  descricao: string;
  qtd: number;
  un: string;
  valor: number;
}

const normalizarLinha = (valor: string) =>
  String(valor || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseNumeroBrasileiro = (valor: string) => {
  const texto = String(valor || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return Number(texto) || 0;
};

export const extrairObjetoCotacaoPdf = (texto: string) => {
  const linhas = texto.split(/\r?\n/).map(normalizarLinha);
  const indice = linhas.findIndex((linha) => /Relatório de Cotação:/i.test(linha));
  if (indice < 0) return "";

  const mesmaLinha = linhas[indice].match(/Relatório de Cotação:\s*(.+)$/i)?.[1]?.trim();
  if (mesmaLinha) return mesmaLinha;

  const proximaLinha = linhas.slice(indice + 1).find(Boolean) || "";
  return proximaLinha;
};

export const parseRelatorioCotacaoPdf = (texto: string): ItemCotacaoPdf[] => {
  const linhas = texto
    .split(/\r?\n/)
    .map(normalizarLinha)
    .filter(Boolean);

  const inicioTabela = linhas.findIndex((linha) => /^Item\s+Preços/i.test(linha));
  if (inicioTabela < 0) {
    throw new Error("Tabela-resumo da cotação não encontrada. O PDF deve seguir o padrão do Banco de Preços.");
  }

  const linhasTabela = linhas.slice(inicioTabela + 1);
  const itens: ItemCotacaoPdf[] = [];
  const regexItem =
    /^(\d+)\)\s*(.*?)\s+(\d+)\s+(\d+(?:[\.,]\d+)?)\s+([A-Za-zÀ-ÿ.]+)\s+R\$\s*([\d.]+,\d{2})\s+[-–—]\s+R\$\s*([\d.]+,\d{2})/i;

  for (const linha of linhasTabela) {
    const match = linha.match(regexItem);
    if (!match) {
      if (/^Detalhamento dos Itens/i.test(linha)) break;
      continue;
    }

    const descricao = normalizarLinha(match[2]);
    const qtd = parseNumeroBrasileiro(match[4]);
    const valor = parseNumeroBrasileiro(match[6]);

    if (!descricao || qtd <= 0 || valor <= 0) continue;

    itens.push({
      numero: Number(match[1]),
      descricao,
      qtd,
      un: match[5].trim(),
      valor,
    });
  }

  if (itens.length === 0) {
    throw new Error("Nenhum item da tabela-resumo foi identificado no PDF.");
  }

  return itens;
};
