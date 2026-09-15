import { MODELO_PADRAO_POR_PROVEDOR } from "./providers/llm";
import { construirPrompt } from "./providers/services/geradorIA";
import { lerConfigIA } from "./utils/storageLocal";
import { mapearDadosWizard } from "./utils/mapearDados";

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export interface FasePreparatoriaJob {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed" | string;
  email: string;
  status_token: string;
  fila_posicao?: number;
  solicitacoes_a_frente?: number;
  message: string;
}

export const consultarFilaFasePreparatoria = async (jobId: string, statusToken?: string) => {
  const query = statusToken ? `?token=${encodeURIComponent(statusToken)}` : "";
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}${query}`);
  if (!response.ok) {
    let detalhe = "Não foi possível consultar a fila.";
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {}
    throw new Error(detalhe);
  }
  return response.json();
};

function construirPromptAuditoriaMarcas(itens: any[], instrucoesUsuario: string): string {
  const itensOriginais = (Array.isArray(itens) ? itens : [])
    .map((item, index) => ({ numero: item?.numero ?? index + 1, nome: String(item?.descricao || "").replace(/\s+/g, " ").trim() }))
    .filter((item) => item.nome);
  return `Você é um auditor de contratações públicas. Sua tarefa é EXCLUSIVAMENTE revisar nomes de itens para identificar uso de marca comercial, fabricante, linha ou produto inequivocamente proprietário SEM justificativa de marca fornecida pelo usuário.\n\nREGRAS ABSOLUTAS:\n1. Analise SOMENTE os nomes dos itens recebidos e a justificativa/instruções do usuário abaixo.\n2. NÃO melhore redação, gramática, precisão técnica, completude, unidade, quantidade, medidas ou especificações.\n3. NÃO corrija um descritivo apenas porque está mal escrito ou incompleto.\n4. Se houver marca comercial sem justificativa, remova SOMENTE o(s) token(s) que identificam a marca/linha proprietária, preservando todo o restante do nome na mesma ordem.\n5. Se houver justificativa explícita e identificável para manter determinada marca, NÃO altere o item.\n6. Não substitua marca por outra marca. Não invente texto. Não acrescente características.\n7. Números de modelo, padrões, normas e códigos só devem ser removidos se forem inequivocamente parte da identificação comercial da marca/linha.\n8. Se não houver marca comercial explícita, devolva o nome exatamente como recebido.\n9. Retorne EXCLUSIVAMENTE JSON válido, sem markdown.\n\nINSTRUÇÕES/JUSTIFICATIVAS DO USUÁRIO:\n${instrucoesUsuario?.trim() || "Nenhuma justificativa específica de marca foi apresentada."}\n\nITENS:\n${JSON.stringify(itensOriginais, null, 2)}\n\nFORMATO OBRIGATÓRIO:\n{\n  "itens": [\n    {\n      "numero": 1,\n      "nome_revisado": "...",\n      "motivo": "..."\n    }\n  ]\n}`;
}

function construirPromptContratacaoDireta(dadosUsuario: Record<string, string>, instrucoesUsuario: string, modalidade: string): string {
  const modalidadeNome = modalidade === "DISPENSA_BLL" ? "Dispensa de Licitação com lances em plataforma eletrônica (BLL)" : "Dispensa de Licitação com recebimento de propostas por e-mail";
  return `Você é especialista sênior em contratação direta pela Lei Federal nº 14.133/2021, com experiência prática em instrução de processos municipais. Elabore o conteúdo de um Documento de Contratação Direta para o Município de São Francisco/SP.\n\nFINALIDADE:\nO documento será o documento específico da contratação direta. Não produza DFD, ETP ou TR neste fluxo. Produza texto formal, impessoal, juridicamente fundamentado, objetivo e operacional.\n\nREGRAS JURÍDICAS E DE FIDELIDADE:\n1. Use a Lei nº 14.133/2021 como referência central e considere sua redação vigente, sem inventar artigo, inciso, alínea ou limitação financeira.\n2. O FUNDAMENTO_CONTRATACAO_DIRETA deve reproduzir ou estruturar o fundamento informado pelo usuário. Se o fundamento legal não tiver sido informado, escreva exatamente: "Fundamento legal não informado no briefing; conferir e preencher antes da assinatura."\n3. NÃO invente número de processo, fornecedor, CNPJ, data, prazo de recebimento de propostas, valor contratado, cotação, pesquisa de preços, parecer, autorização ou publicação.\n4. Diferencie claramente valor estimado da contratação e eventual valor contratado.\n5. Não declare que documentos do art. 72 foram efetivamente juntados se isso não estiver nos dados. Apresente apenas uma orientação de instrução processual, identificando o que deve ser conferido.\n6. Na RAZAO/CRITERIOS de escolha do fornecedor, produza critérios e fundamentação para seleção objetiva. Não atribua a um fornecedor específico características que não foram fornecidas.\n7. Para a forma de processamento, respeite a modalidade informada: ${modalidadeNome}. Não invente regras específicas da plataforma ou prazos não fornecidos.\n8. Preserve integralmente os fatos fornecidos nas instruções do usuário.\n9. O texto deve ser específico para contratação direta; não trate o procedimento como pregão ou licitação ordinária.\n10. Retorne EXCLUSIVAMENTE um único objeto JSON válido, sem markdown ou comentários. Nenhum valor deve ser vazio.\n\nDADOS DO USUÁRIO:\n${JSON.stringify(dadosUsuario, null, 2)}\n\nINSTRUÇÕES DO USUÁRIO:\n${instrucoesUsuario?.trim() || "Nenhuma instrução adicional."}\n\nESTRUTURA JSON OBRIGATÓRIA:\n{\n  "FUNDAMENTO_CONTRATACAO_DIRETA": "",\n  "JUSTIFICATIVA_CONTRATACAO_DIRETA": "",\n  "INSTRUCAO_ART72": "",\n  "CRITERIOS_ESCOLHA_FORNECEDOR": "",\n  "CONDICOES_CONTRATACAO": "",\n  "PUBLICIDADE_TRANSPARENCIA": "",\n  "CONCLUSAO_CONTRATACAO_DIRETA": ""\n}`;
}

function prepararEspecificacao(etapa: "DFD" | "ETP" | "TR", dadosUsuario: Record<string, string>, meeppExclusivo: boolean): string {
  return construirPrompt({
    ...dadosUsuario,
    INSTRUCOES_EXTRAS: `Geração unificada em uma única chamada. O ${etapa} pertence à mesma contratação dos demais blocos e deve manter coerência global. Não dependa de uma chamada anterior nem trate os outros blocos como documentos de contratação diferentes.`,
  }, meeppExclusivo, etapa)
    .replace(/__LICITA_PIPE_DFD__/g, "O bloco DFD será produzido na mesma resposta.")
    .replace(/__LICITA_PIPE_ETP__/g, "O bloco ETP será produzido na mesma resposta.")
    .replace(/__LICITA_PIPE_DADOS_USUARIO__/g, "Os dados da contratação fornecidos acima.")
    .replace(/__LICITA_PIPE_ETAPAS__/g, "Os blocos DFD, ETP e TR produzidos conjuntamente na mesma resposta.");
}

function construirPromptUnificado(dadosUsuario: Record<string, string>, meeppExclusivo: boolean): string {
  const dfd = prepararEspecificacao("DFD", dadosUsuario, meeppExclusivo);
  const etp = prepararEspecificacao("ETP", dadosUsuario, meeppExclusivo);
  const tr = prepararEspecificacao("TR", dadosUsuario, meeppExclusivo);

  return `Você é especialista sênior em licitações e contratos administrativos para a Prefeitura de São Francisco/SP.\n\nGERE DFD, ETP E TR EM UMA ÚNICA CHAMADA DE IA.\nOs três documentos pertencem à mesma contratação e devem ser escritos com um único raciocínio global. A resposta deve ser um único objeto JSON contendo exatamente três blocos: DFD, ETP e TR.\n\nDADOS DA CONTRATAÇÃO:\n${JSON.stringify(dadosUsuario, null, 2)}\n\nESPECIFICAÇÕES OBRIGATÓRIAS DO DFD:\n${dfd}\n\nESPECIFICAÇÕES OBRIGATÓRIAS DO ETP:\n${etp}\n\nESPECIFICAÇÕES OBRIGATÓRIAS DO TR:\n${tr}\n\nESTRUTURA JSON FINAL OBRIGATÓRIA:\n{\n  "DFD": {\n    "OBJETO": "",\n    "TIPO_OBJ": "",\n    "JUSTIFICATIVA": "",\n    "ESTIMATIVA_QUANTIDADES": "",\n    "RESULTADOS_ESPERADOS": ""\n  },\n  "ETP": {\n    "REQUISITOS_ETP": "",\n    "SUBCONTRATACAO_ETP": "",\n    "ME_EPP_ETP": "",\n    "JUSTIFICATIVA_PAC": "",\n    "MERCADO": "",\n    "SOLUCAO": "",\n    "CRITERIOS_JUSTIFICATIVA_ETP": "",\n    "CRITERIOS_SUSTENTABILIDADE": "",\n    "MODALIDADE_JUSTIFICATIVA_ETP": "",\n    "PROVIDENCIAS_CONT": "",\n    "CORRELATAS_INTER": "",\n    "JUSTIFICATIVA_ESTIMATIVA": "",\n    "GARANTIAS_ETP": "",\n    "VISTORIA_ETP": "",\n    "AMOSTRA_ETP": "",\n    "VALOR_ESTIMADO_APROXIMADO": "",\n    "PARCELAMENTO": "",\n    "CONCLUSAO": ""\n  },\n  "TR": {\n    "REQUISITOS_TR": "",\n    "OBRIGACOES_CONTRATADA": "",\n    "OBRIGACOES_CONTRANTE": "",\n    "QUALIFICACAO_TECNICA": "",\n    "GARANTIAS_TR": "",\n    "EXECUCAO": "",\n    "PRAZO_EXEC": "",\n    "LOCAL": "",\n    "AMOSTRA_TR": ""\n  }\n}\n\nREGRAS FINAIS:\n1. Retorne EXCLUSIVAMENTE JSON válido, sem markdown.\n2. Não deixe nenhuma chave obrigatória vazia.\n3. Não invente fatos.\n4. Mantenha absoluta coerência entre DFD, ETP e TR.\n5. O objeto deve conter somente os três blocos DFD, ETP e TR.`;
}

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaJob> => {
  if (!BASE_URL) throw new Error("API do Licita.AI não configurada.");

  const dadosOriginais = { ...(dados?.dados_usuario || {}) } as Record<string, any>;
  const dadosUsuario = mapearDadosWizard(dadosOriginais) as Record<string, string>;
  const instrucoes = String(dados?.instrucoes || "").trim();
  const meeppExclusivo = dadosUsuario["{{ME_EPP}}"] === "SIM";
  const config = lerConfigIA();
  const provedor = config.provedor || "backend";
  const modeloSalvo = config.modelo || MODELO_PADRAO_POR_PROVEDOR[provedor] || MODELO_PADRAO_POR_PROVEDOR.backend;
  const modelo = modeloSalvo || "unsloth-auto";

  const modalidade = String(dadosUsuario["{{MODALIDADE}}"] || "").trim().toUpperCase();
  const ehContratacaoDireta = ["DISPENSA_EMAIL", "DISPENSA_BLL"].includes(modalidade);
  const etapas: Array<{ id: string; tipo: string; prompt: string }> = [];

  const itensJson = dadosUsuario["{{ITENS}}"]; 
  let itens: any[] = [];
  if (typeof itensJson === "string") {
    try { itens = JSON.parse(itensJson.replace(/^__TABLE__/, "")); } catch { itens = []; }
  } else if (Array.isArray(itensJson)) {
    itens = itensJson;
  }

  if (itens.length > 0) etapas.push({ id: "AUDITORIA_MARCAS", tipo: "auditoria_marcas", prompt: construirPromptAuditoriaMarcas(itens, instrucoes) });

  if (ehContratacaoDireta) {
    etapas.push({ id: "CONTRATACAO_DIRETA", tipo: "geracao_contratacao_direta", prompt: construirPromptContratacaoDireta(dadosUsuario, instrucoes, modalidade) });
  } else {
    etapas.push({ id: "FASE_PREPARATORIA", tipo: "geracao_unificada", prompt: `${construirPromptUnificado(dadosUsuario, meeppExclusivo)}\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${instrucoes || "Nenhuma."}` });
  }

  const payload = {
    email: dados.email,
    instrucoes,
    dados_usuario: dadosUsuario,
    dados_ia: { __LICITA_PIPELINE__: { version: 3, provider: provedor, model: modelo, temperature: 0.3, eh_contratacao_direta: ehContratacaoDireta, etapas } },
  };

  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detalhe = "Falha ao colocar a geração na fila.";
    try { const erroJson = await response.json(); detalhe = erroJson?.detail || detalhe; } catch {}
    throw new Error(detalhe);
  }

  return response.json();
};
