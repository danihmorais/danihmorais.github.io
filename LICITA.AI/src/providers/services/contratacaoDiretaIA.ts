import { gerarTextoIA } from "../llm";

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

  const resposta = await gerarTextoIA(prompt, apiKey, modelo);
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
