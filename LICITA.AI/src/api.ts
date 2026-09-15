import { MODELO_PADRAO_POR_PROVEDOR } from "./providers/llm";
import { construirPrompt } from "./providers/services/geradorIA";
import { lerConfigIA } from "./utils/storageLocal";

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

const CONTEXTO_DFD = "__LICITA_PIPE_DFD__";
const CONTEXTO_ETP = "__LICITA_PIPE_ETP__";
const DADOS_ATUALIZADOS = "__LICITA_PIPE_DADOS_USUARIO__";
const SAIDA_ETAPAS = "__LICITA_PIPE_ETAPAS__";

function criarContextoEtapa(nome: "DFD" | "ETP" | "TR", documentosAnteriores: Record<string, string> = {}): string {
  const blocos = Object.entries(documentosAnteriores)
    .map(([nomeDocumento, conteudo]) => (
      `DOCUMENTO ${nomeDocumento} JÁ GERADO PARA ESTA MESMA CONTRATAÇÃO.\n` +
      `Use este documento como CONTEXTO AUTORITATIVO e preserve sua coerência no documento atual.\n` +
      `${conteudo}`
    ))
    .join("\n\n");

  return [
    `CONTEXTO DE GERAÇÃO ENCADEADA - ETAPA ATUAL: ${nome}`,
    "As três etapas DFD → ETP → TR pertencem à mesma contratação e devem ser tratadas como uma única linha de raciocínio.",
    "Não contradiga informações já estabelecidas nos documentos anteriores.",
    "Quando houver conflito entre uma inferência genérica e um documento anterior, preserve a informação já estabelecida no documento anterior, salvo instrução expressa em contrário.",
    blocos,
  ].filter(Boolean).join("\n\n");
}

function construirPromptAuditoriaMarcas(itens: any[], instrucoesUsuario: string): string {
  const itensOriginais = (Array.isArray(itens) ? itens : [])
    .map((item, index) => ({
      numero: item?.numero ?? index + 1,
      nome: String(item?.descricao || "").replace(/\s+/g, " ").trim(),
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

function construirPromptContratacaoDireta(dadosUsuario: Record<string, string>, instrucoesUsuario: string, modalidade: string): string {
  const modalidadeNome = modalidade === "DISPENSA_BLL"
    ? "Dispensa de Licitação com lances em plataforma eletrônica (BLL)"
    : "Dispensa de Licitação com recebimento de propostas por e-mail";

  return `Você é especialista sênior em contratação direta pela Lei Federal nº 14.133/2021, com experiência prática em instrução de processos municipais. Elabore o conteúdo de um Documento de Contratação Direta para o Município de São Francisco/SP.

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

DADOS DO USUÁRIO APÓS AUDITORIA:
${DADOS_ATUALIZADOS}

INSTRUÇÕES DO USUÁRIO:
${instrucoesUsuario?.trim() || "Nenhuma instrução adicional."}

DOCUMENTOS ANTERIORES DA MESMA CONTRATAÇÃO:
${SAIDA_ETAPAS}

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
}

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaJob> => {
  if (!BASE_URL) throw new Error("API do Licita.AI não configurada.");

  const dadosUsuario = { ...(dados?.dados_usuario || {}) } as Record<string, string>;
  const instrucoes = String(dados?.instrucoes || "").trim();
  const meeppExclusivo = dadosUsuario["{{ME_EPP}}"] === "SIM";
  const config = lerConfigIA();
  const provedor = config.provedor || "openrouter";
  const modelo = config.modelo || MODELO_PADRAO_POR_PROVEDOR[provedor] || MODELO_PADRAO_POR_PROVEDOR.openrouter;

  if (provedor !== "openrouter") {
    throw new Error("Para a fila assíncrona, selecione o provedor OpenRouter nas configurações de IA.");
  }

  const etapas: Array<{ id: string; tipo: string; prompt: string }> = [];
  const itensJson = dadosUsuario["{{ITENS}}"];
  let itens: any[] = [];
  if (typeof itensJson === "string") {
    try { itens = JSON.parse(itensJson.replace(/^__TABLE__/, "")); } catch { itens = []; }
  } else if (Array.isArray(itensJson)) {
    itens = itensJson;
  }

  if (itens.length > 0) {
    etapas.push({ id: "AUDITORIA_MARCAS", tipo: "auditoria_marcas", prompt: construirPromptAuditoriaMarcas(itens, instrucoes) });
  }

  const dfd = { ...dadosUsuario, INSTRUCOES_EXTRAS: criarContextoEtapa("DFD") };
  etapas.push({ id: "DFD", tipo: "geracao_json", prompt: `${construirPrompt(dfd, meeppExclusivo, "DFD")}\n\nDADOS ATUALIZADOS APÓS ETAPAS PRÉVIAS:\n${DADOS_ATUALIZADOS}` });

  const etp = { ...dadosUsuario, INSTRUCOES_EXTRAS: criarContextoEtapa("ETP", { DFD: CONTEXTO_DFD }) };
  etapas.push({ id: "ETP", tipo: "geracao_json", prompt: `${construirPrompt(etp, meeppExclusivo, "ETP")}\n\nDADOS ATUALIZADOS APÓS ETAPAS PRÉVIAS:\n${DADOS_ATUALIZADOS}` });

  const tr = { ...dadosUsuario, INSTRUCOES_EXTRAS: criarContextoEtapa("TR", { DFD: CONTEXTO_DFD, ETP: CONTEXTO_ETP }), REQUISITOS_ETP_ANTERIOR: CONTEXTO_ETP };
  etapas.push({ id: "TR", tipo: "geracao_json", prompt: `${construirPrompt(tr, meeppExclusivo, "TR")}\n\nDADOS ATUALIZADOS APÓS ETAPAS PRÉVIAS:\n${DADOS_ATUALIZADOS}` });

  const modalidade = String(dadosUsuario["{{MODALIDADE}}"] || "").trim().toUpperCase();
  if (["DISPENSA_EMAIL", "DISPENSA_BLL"].includes(modalidade)) {
    etapas.push({ id: "CONTRATACAO_DIRETA", tipo: "geracao_contratacao_direta", prompt: construirPromptContratacaoDireta(dadosUsuario, instrucoes, modalidade) });
  }

  const payload = {
    email: dados.email,
    instrucoes,
    dados_usuario: dadosUsuario,
    dados_ia: {
      __LICITA_PIPELINE__: {
        version: 1,
        provider: provedor,
        model: modelo,
        temperature: 0.3,
        etapas,
      },
    },
  };

  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detalhe = "Falha ao colocar a geração na fila.";
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {}
    throw new Error(detalhe);
  }

  return response.json();
};
