import { gerarTextoOpenRouter } from "../llm";

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

  const prompt = `Você é um auditor de contratações públicas. Sua tarefa é EXCLUSIVAMENTE revisar nomes de itens para identificar uso de marca comercial, fabricante, linha ou produto inequivocamente proprietário SEM justificativa de marca fornecida pelo usuário.

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

  const resposta = await gerarTextoOpenRouter(prompt, apiKey, modelo);
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
  objeto: string,
  necessidade: string,
  apiKey: string,
  modelo: string,
): Promise<string> {
  const original = normalizarNome(descricao);
  if (!original) throw new Error("Informe uma descrição antes de solicitar a melhoria.");

  const prompt = `Você é um redator técnico especializado em especificações para contratações públicas.

Melhore EXCLUSIVAMENTE a descrição do item abaixo. Retorne uma descrição mais clara, objetiva, técnica e apta à contratação, preservando exatamente o objeto pretendido.

REGRAS ABSOLUTAS:
1. Trabalhe SOMENTE neste item; não analise nem mencione outros itens.
2. Não altere quantidade ou unidade.
3. Não invente marca, fabricante, modelo, código proprietário, certificação, norma ou característica que não esteja implícita de forma segura na descrição original.
4. Não transforme a descrição em justificativa, obrigação contratual, condição de habilitação ou exigência de fornecedor.
5. Não crie requisito restritivo sem necessidade técnica evidente.
6. Preserve medidas, capacidades, materiais e características existentes quando forem inequívocos.
7. Corrija problemas de redação, ambiguidades linguísticas e organização das características.
8. Retorne EXCLUSIVAMENTE JSON válido no formato {\"descricao\":\"...\"}.

OBJETO DA CONTRATAÇÃO:
${normalizarNome(objeto) || "Não informado."}

NECESSIDADE ADMINISTRATIVA:
${normalizarNome(necessidade) || "Não informada."}

DESCRIÇÃO ORIGINAL DO ITEM:
${original}`;

  const resposta = await gerarTextoOpenRouter(prompt, apiKey, modelo);
  const novaDescricao = normalizarNome(resposta?.descricao);
  if (!novaDescricao) throw new Error("A IA não retornou uma descrição válida para o item.");
  return novaDescricao;
}

export async function gerarDadosContratacaoDireta(
  dadosUsuario: Record<string, string>,
  dadosIaAnteriores: Record<string, any>,
  instrucoesUsuario: string,
  modalidade: string,
  apiKey: string,
  modelo: string,
): Promise<Record<string, string>> {
  const modalidadeNome = modalidade === "DISPENSA_BLL"
    ? "Dispensa de Licitação com lances em plataforma eletrônica (BLL)"
    : "Dispensa de Licitação com recebimento de propostas por e-mail";

  const prompt = `Você é especialista sênior em contratação direta pela Lei Federal nº 14.133/2021, com experiência prática em instrução de processos municipais. Elabore o conteúdo de um Documento de Contratação Direta para o Município de São Francisco/SP.

FINALIDADE:
O documento será anexado ao processo administrativo e deve complementar a fase preparatória, sem substituir DFD, ETP ou TR. Produza texto formal, impessoal, juridicamente fundamentado, objetivo e operacional.

REGRAS JURÍDICAS E DE FIDELIDADE:
1. Use a Lei nº 14.133/2021 como referência central e considere sua redação vigente, sem inventar artigo, inciso, alínea ou limitação financeira.
2. O FUNDAMENTO_CONTRATACAO_DIRETA deve reproduzir ou estruturar o fundamento informado pelo usuário. Se o fundamento legal não tiver sido informado, escreva exatamente: "Fundamento legal não informado no briefing; conferir e preencher antes da assinatura."
3. NÃO invente número de processo, fornecedor, CNPJ, data, prazo de recebimento de propostas, valor contratado, cotação, pesquisa de preços, parecer, autorização ou publicação.
4. Diferencie claramente valor estimado da contratação e eventual valor contratado.
5. Não declare que documentos do art. 72 foram efetivamente juntados se isso não estiver nos dados. Apresente apenas uma orientação de instrução processual, identificando o que deve ser conferido.
6. Na RAZAO/CRITERIOS de escolha do fornecedor, produza critérios e fundamentação para seleção objetiva. Não atribua a um fornecedor específico características que não foram fornecidas.
7. Para a forma de processamento, respeite a modalidade informada: ${modalidadeNome}. Não invente regras específicas da plataforma ou prazos não fornecidos.
8. Preserve integralmente os fatos fornecidos nos documentos anteriores e nas instruções do usuário.
9. O texto deve ser específico para contratação direta; não trate o procedimento como pregão ou licitação ordinária.
10. Retorne EXCLUSIVAMENTE um único objeto JSON válido, sem markdown ou comentários. Nenhum valor deve ser vazio.

DADOS DO USUÁRIO:
${JSON.stringify(dadosUsuario, null, 2)}

INSTRUÇÕES DO USUÁRIO:
${instrucoesUsuario?.trim() || "Nenhuma instrução adicional."}

DOCUMENTOS ANTERIORES DA MESMA CONTRATAÇÃO:
${JSON.stringify(dadosIaAnteriores, null, 2)}

ESTRUTURA JSON OBRIGATÓRIA:
{
  "FUNDAMENTO_CONTRATACAO_DIRETA": "",
  "JUSTIFICATIVA_CONTRATACAO_DIRETA": "",
  "INSTRUCAO_ART72": "",
  "CRITERIOS_ESCOLHA_FORNECEDOR": "",
  "CONDICOES_CONTRATACAO": "",
  "PUBLICIDADE_TRANSPARENCIA": "",
  "CONCLUSAO_CONTRATACAO_DIRETA": ""
}`;

  const resposta = await gerarTextoOpenRouter(prompt, apiKey, modelo);
  const chavesObrigatorias = [
    "FUNDAMENTO_CONTRATACAO_DIRETA",
    "JUSTIFICATIVA_CONTRATACAO_DIRETA",
    "INSTRUCAO_ART72",
    "CRITERIOS_ESCOLHA_FORNECEDOR",
    "CONDICOES_CONTRATACAO",
    "PUBLICIDADE_TRANSPARENCIA",
    "CONCLUSAO_CONTRATACAO_DIRETA",
  ];

  for (const chave of chavesObrigatorias) {
    const valor = resposta?.[chave];
    if (typeof valor !== "string" || !valor.trim()) {
      throw new Error(`A geração do Documento de Contratação Direta não retornou o campo ${chave}.`);
    }
  }

  return resposta as Record<string, string>;
}
