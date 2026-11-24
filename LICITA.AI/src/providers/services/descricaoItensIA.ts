import { gerarTextoIA } from "../llm";

function normalizarNome(nome: string): string {
  return String(nome || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function melhorarDescricaoItem(
  descricao: string,
  unidade: string,
  objeto: string,
  necessidade: string,
  apiKey: string,
  modelo: string,
): Promise<{ descricao: string; unidade: string }> {
  const original = normalizarNome(descricao);
  if (!original) throw new Error("Informe uma descrição antes de solicitar a melhoria.");

  const unidadeOriginal = normalizarNome(unidade);

  const resposta = await gerarTextoIA("melhorar_descricao", {
    descricao: original,
    unidade: unidadeOriginal,
    objeto: normalizarNome(objeto),
    necessidade: normalizarNome(necessidade),
  });
  const novaDescricao = normalizarNome(resposta?.descricao);
  const novaUnidade = normalizarNome(resposta?.unidade) || unidadeOriginal;
  if (!novaDescricao) throw new Error("A IA não retornou uma descrição válida para o item.");
  if (!novaUnidade) throw new Error("A IA não retornou uma unidade válida para o item.");
  return { descricao: novaDescricao, unidade: novaUnidade };
}
