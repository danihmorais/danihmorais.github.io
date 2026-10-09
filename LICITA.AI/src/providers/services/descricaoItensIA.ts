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

export function construirPromptAuditoriaMarcas(itens: any[], instrucoesUsuario: string): string {
  const itensOriginais = (Array.isArray(itens) ? itens : [])
    .map((item, index) => ({
      numero: item?.numero ?? index + 1,
      nome: normalizarNome(item?.descricao ?? ""),
    }))
    .filter((item) => item.nome);

  return `Você é um auditor de contratações públicas. Sua tarefa é EXCLUSIVAMENTE revisar nomes de itens para identificar uso de marca comercial, fabricante, linha ou produto inequivocamente proprietário SEM justificativa de marca fornecida pelo usuário.

REGRAS ABSOLUTAS:
1. Analise SOMENTE os nomes dos itens recebidos e a justificativa/instruções do usuário abaixo.
2. NÃO melhore redação, gramática, precisão técnica, completude, unidade, quantidade, medidas ou especificações.
3. NÃO corrija um descritivo apenas porque está mal escrito ou incompleto.
4. Se houver marca comercial sem justificativa, remova SOMENTE o(s) token(s) que identificam a marca/linha proprietária, preservando todo o restante do nome na mesma ordem.
5. Se houver justificativa explícita e identificável para manter determinada marca, NÃO altere o item.
6. Não substitua marca por outra marca. Não invente texto. Não acrescente características.
7. Números de modelo, padrões, normas e códigos só devem ser removidos se forem inequivocamente parte da identificação comercial da marca/linha.
8. Se não houver marca comercial explícita, devolva o nome exatamente como recebido.
9. Retorne EXCLUSIVAMENTE JSON válido, sem markdown.

INSTRUÇÕES/JUSTIFICATIVAS DO USUÁRIO:
${instrucoesUsuario?.trim() || "Nenhuma justificativa específica de marca foi apresentada."}

ITENS:
${JSON.stringify(itensOriginais, null, 2)}

FORMATO OBRIGATÓRIO:
{
  "itens": [
    {
      "numero": 1,
      "nome_revisado": "...",
      "motivo": "..."
    }
  ]
}`;
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

  const prompt = construirPromptAuditoriaMarcas(itens, instrucoesUsuario);

  const resposta = await gerarTextoIA(prompt, apiKey, modelo);
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

  const prompt = `Você é um redator técnico especializado em especificações para contratações públicas.

Melhore a DESCRIÇÃO do item e verifique a coerência da UNIDADE DE MEDIDA. Retorne uma descrição mais clara, objetiva, técnica e apta à contratação, preservando exatamente o objeto pretendido.

REGRAS ABSOLUTAS:
1. Trabalhe SOMENTE neste item; não analise nem mencione outros itens.
2. A quantidade e o valor unitário não podem ser alterados.
3. A unidade de medida pode ser corrigida SOMENTE quando a descrição contiver uma indicação clara e inequívoca de que a unidade atual está incompatível com o que está sendo adquirido.
4. Não faça conversões de quantidade ou de embalagem. Ex.: não transforme "caixa com 12" em 12 unidades nem altere a quantidade informada.
5. Quando a unidade atual for compatível ou quando houver dúvida, preserve exatamente a unidade atual.
6. Não invente marca, fabricante, modelo, código proprietário, certificação, norma ou característica que não esteja implícita de forma segura na descrição original.
7. Não transforme a descrição em justificativa, obrigação contratual, condição de habilitação ou exigência de fornecedor.
8. Não crie requisito restritivo sem necessidade técnica evidente.
9. Preserve medidas, capacidades, materiais e características existentes quando forem inequívocos.
10. Corrija problemas de redação, ambiguidades linguísticas e organização das características.
11. Retorne EXCLUSIVAMENTE JSON válido no formato {"descricao":"...","unidade":"..."}.

OBJETO DA CONTRATAÇÃO:
${normalizarNome(objeto) || "Não informado."}

NECESSIDADE ADMINISTRATIVA:
${normalizarNome(necessidade) || "Não informada."}

DESCRIÇÃO ORIGINAL DO ITEM:
${original}

UNIDADE ATUAL DO ITEM:
${unidadeOriginal || "Não informada."}`;

  const resposta = await gerarTextoIA(prompt, apiKey, modelo);
  const novaDescricao = normalizarNome(resposta?.descricao);
  const novaUnidade = normalizarNome(resposta?.unidade) || unidadeOriginal;
  if (!novaDescricao) throw new Error("A IA não retornou uma descrição válida para o item.");
  if (!novaUnidade) throw new Error("A IA não retornou uma unidade válida para o item.");
  return { descricao: novaDescricao, unidade: novaUnidade };
}
