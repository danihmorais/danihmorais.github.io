import { gerarTextoIA } from "../llm";

interface ItemAuditoria {
  numero: number | string;
  nome_original: string;
  nome_revisado: string;
  alterado: boolean;
  motivo: string;
}

function normalizarNome(nome: string): string {
  return String(nome || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizar(nome: string): string[] {
  return normalizarNome(nome)
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean);
}

function alteracaoApenasRemoveTokens(original: string, revisado: string): boolean {
  const origem = tokenizar(original);
  const destino = tokenizar(revisado);
  if (!origem.length || !destino.length) return false;
  let cursor = 0;
  for (const token of destino) {
    const indice = origem.indexOf(token, cursor);
    if (indice === -1) return false;
    cursor = indice + 1;
  }
  return destino.length < origem.length;
}

function validarAuditoria(itensOriginais: Array<{ numero: number | string; nome: string }>, resposta: any): ItemAuditoria[] {
  if (!Array.isArray(resposta?.itens)) {
    throw new Error("A auditoria de marcas retornou um formato inválido.");
  }

  const porNumero = new Map<string, any>();
  for (const item of resposta.itens) {
    const chave = String(item?.numero ?? "");
    if (chave) porNumero.set(chave, item);
  }

  return itensOriginais.map((item) => {
    const original = normalizarNome(item.nome);
    const retorno = porNumero.get(String(item.numero));
    const proposto = normalizarNome(retorno?.nome_revisado ?? original);

    if (!retorno || proposto === original) {
      return {
        numero: item.numero,
        nome_original: original,
        nome_revisado: original,
        alterado: false,
        motivo: "Nenhuma marca sem justificativa identificada.",
      };
    }

    const permitido = alteracaoApenasRemoveTokens(original, proposto);
    if (!permitido) {
      return {
        numero: item.numero,
        nome_original: original,
        nome_revisado: original,
        alterado: false,
        motivo: "Alteração descartada porque ultrapassava a remoção isolada de marca.",
      };
    }

    return {
      numero: item.numero,
      nome_original: original,
      nome_revisado: proposto,
      alterado: true,
      motivo: String(retorno?.motivo || "Marca sem justificativa identificada e removida.").trim(),
    };
  });
}

export async function revisarMarcasItens(
  itens: any[],
  instrucoesUsuario: string,
  apiKey: string,
  modelo: string,
): Promise<{ itens: any[]; auditoria: ItemAuditoria[] }> {
  const itensOriginais = (Array.isArray(itens) ? itens : [])
    .map((item, index) => ({
      numero: item?.numero ?? index + 1,
      nome: normalizarNome(item?.descricao ?? ""),
    }))
    .filter((item) => item.nome);

  if (!itensOriginais.length) {
    return { itens, auditoria: [] };
  }

  const resposta = await gerarTextoIA("auditoria_marcas", {
    itens: itensOriginais.map((item) => ({ numero: String(item.numero), descricao: item.nome })),
    instrucoes: instrucoesUsuario,
  });
  const auditoria = validarAuditoria(itensOriginais, resposta);
  const auditoriaPorNumero = new Map(auditoria.map((item) => [String(item.numero), item]));

  const itensRevisados = (Array.isArray(itens) ? itens : []).map((item, index) => {
    const numero = item?.numero ?? index + 1;
    const revisao = auditoriaPorNumero.get(String(numero));
    if (!revisao || revisao.nome_revisado === normalizarNome(item?.descricao ?? "")) return item;
    return { ...item, descricao: revisao.nome_revisado };
  });

  return { itens: itensRevisados, auditoria };
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
