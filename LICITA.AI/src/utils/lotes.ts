export type LoteContratacao = {
  id: string;
  nome: string;
};

function nomeNormalizado(valor: unknown): string {
  return String(valor ?? "").trim().toLocaleLowerCase("pt-BR");
}

/**
 * Lê a estrutura atual de lotes e mantém compatibilidade com rascunhos antigos
 * que armazenavam apenas item.lote como texto.
 */
export function obterLotes(dados: any): LoteContratacao[] {
  const explicitos = Array.isArray(dados?.lotes)
    ? dados.lotes
        .filter((lote: any) => lote && String(lote.id ?? "").trim() && String(lote.nome ?? "").trim())
        .map((lote: any) => ({ id: String(lote.id), nome: String(lote.nome).trim() }))
    : [];
  if (explicitos.length) return explicitos;

  const nomes = new Map<string, string>();
  for (const item of Array.isArray(dados?.itens) ? dados.itens : []) {
    const nome = String(item?.lote ?? "").trim();
    const chave = nomeNormalizado(nome);
    if (chave && !nomes.has(chave)) nomes.set(chave, nome);
  }
  return [...nomes.entries()].map(([chave, nome]) => ({ id: "legado:" + chave, nome }));
}

export function obterLoteIdItem(item: any, lotes: LoteContratacao[]): string {
  const id = String(item?.loteId ?? "").trim();
  if (id && lotes.some((lote) => lote.id === id)) return id;

  const nome = nomeNormalizado(item?.lote);
  if (!nome) return "";
  return lotes.find((lote) => nomeNormalizado(lote.nome) === nome)?.id ?? "";
}

/** Se há lotes, cada item precisa pertencer a um lote existente e nenhum lote pode ficar vazio. */
export function distribuicaoLotesValida(dados: any): boolean {
  const itens = Array.isArray(dados?.itens) ? dados.itens : [];
  const lotes = obterLotes(dados);
  if (!lotes.length) return true;
  if (!itens.length) return false;

  const idsConhecidos = new Set(lotes.map((lote) => lote.id));
  const contagens = new Map(lotes.map((lote) => [lote.id, 0]));
  for (const item of itens) {
    const loteId = obterLoteIdItem(item, lotes);
    if (!loteId || !idsConhecidos.has(loteId)) return false;
    contagens.set(loteId, (contagens.get(loteId) ?? 0) + 1);
  }
  return lotes.every((lote) => (contagens.get(lote.id) ?? 0) > 0);
}
