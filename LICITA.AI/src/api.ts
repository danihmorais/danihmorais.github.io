import { construirPrompt } from "./providers/services/geradorIA";
import { construirPromptAuditoriaMarcas } from "./providers/services/descricaoItensIA";
import { mapearDadosWizard } from "./utils/mapearDados";

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export interface FasePreparatoriaJob {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed" | "cancelled" | "cancelling" | string;
  email: string;
  status_token: string;
  fila_posicao?: number;
  solicitacoes_a_frente?: number;
  message: string;
  documentos_referencia?: {
    quantidade: number;
    total_caracteres: number;
    documentos: Array<{ tipo: string; nome: string; origem: string }>;
  };
}

export interface DocumentosReferenciaUpload {
  dfd?: File | null;
  etp?: File | null;
  tr?: File | null;
  edital?: File | null;
}

function ehArquivoUpload(valor: unknown): valor is File {
  if (!valor || typeof valor !== "object") return false;
  const arquivo = valor as Record<string, unknown>;
  return typeof arquivo.name === "string" && typeof arquivo.size === "number";
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

export async function cancelarFilaFasePreparatoria(jobId: string, statusToken: string): Promise<{ job_id: string; status: string; message: string }> {
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}/cancelar?token=${encodeURIComponent(statusToken)}`, { method: "POST" });
  let payload: any = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload?.detail || "Não foi possível cancelar a solicitação.");
  return payload;
}

export async function cancelarAdminPedido(token: string, jobId: string): Promise<{ job_id: string; status: string; message: string }> {
  const response = await fetch(BASE_URL + "/licita/api/admin/jobs/" + encodeURIComponent(jobId) + "/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  return respostaAdmin(response);
}

export function dadosParaPrompt(dados: Record<string, any>): Record<string, any> {
  const resultado: Record<string, any> = { ...dados };
  const dotacaoBruta = String(dados["{{DOTACAO}}"] || "");
  const caminhoImagem = String(dados["{{CAMINHO_IMAGEM_DOTACAO}}"] || "");
  const linhasTexto = dotacaoBruta.split(/\r?\n/).filter((linha) => linha.trim() && !linha.trim().startsWith("__IMG__") && !linha.trim().startsWith("data:image/"));
  const imagens = (dotacaoBruta.match(/__IMG__/g) || []).length + (caminhoImagem ? 1 : 0);
  const textoDotacao = linhasTexto.join("\n").trim();
  resultado["{{DOTACAO}}"] = imagens
    ? ["Dotação informada (" + imagens + " imagem(ns)" + (textoDotacao ? " e texto" : "") + ").", textoDotacao].filter(Boolean).join("\n")
    : (textoDotacao || dotacaoBruta.replace(/data:image\/[^;]+;base64,[^\s]+/g, "[imagem omitida]"));
  for (const chave of ["{{CAMINHO_IMAGEM_DOTACAO}}", "{{CONTATOS_SECRETARIAS}}", "ITENS_NOMES", "PAGAMENTO_ETAPAS_RAW", "INSTRUCOES_EXTRAS", "RAW_EXECUCAO", "RAW_MOTIVO_CRITERIO", "RAW_MOTIVO_MODALIDADE", "RAW_PAC", "REQUISITOS_ETP_ANTERIOR"]) delete resultado[chave];
  const limpar = (valor: any): any => {
    if (Array.isArray(valor)) return valor.map(limpar);
    if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, limpar(item)]));
    if (typeof valor === "string") {
      if (valor.startsWith("__IMG__") || valor.startsWith("data:image/")) return "[imagem omitida do prompt]";
      return valor.replace(/__IMG__[A-Za-z0-9+/=]+/g, "[imagem omitida do prompt]").replace(/data:image\/[^;]+;base64,[^\s]+/g, "[imagem omitida do prompt]");
    }
    return valor;
  };
  return limpar(resultado);
}

function construirPromptPagamentoEtapas(textoUsuario: string): string {
  return `Você é especialista em redação de cláusulas de pagamento de contratos administrativos regidos pela Lei Federal nº 14.133/2021.

Sua tarefa é REVISAR EXCLUSIVAMENTE a descrição fornecida pelo usuário para pagamento por etapas, transformando-a em texto formal, claro, objetivo, juridicamente adequado e operacional.

REGRAS ABSOLUTAS:
1. Preserve integralmente as etapas, eventos, critérios e condições informadas pelo usuário.
2. NÃO invente percentuais, valores, prazos, datas, marcos, documentos ou condições que não estejam no texto do usuário.
3. NÃO transforme pagamento por etapas em pagamento mensal, por entrega ou qualquer outra modalidade.
4. Não altere o número ou a natureza das etapas informadas.
5. Corrija apenas redação, clareza, gramática, coerência e formalidade jurídica.
6. Retorne EXCLUSIVAMENTE JSON válido, sem markdown.

DESCRIÇÃO INFORMADA PELO USUÁRIO:
${textoUsuario}

ESTRUTURA OBRIGATÓRIA:
{
  "PAGAMENTO": ""
}

O campo PAGAMENTO deve conter somente o texto final revisado sobre o pagamento por etapas.`;
}
function construirPromptContratacaoDireta(dadosUsuario: Record<string, string>, instrucoesUsuario: string, modalidade: string): string {
  const modalidadeNome = modalidade === "DISPENSA_BLL" ? "Dispensa de Licitação com lances em plataforma eletrônica (BLL)" : "Dispensa de Licitação com recebimento de propostas por e-mail";
  return `Você é especialista sênior em contratação direta pela Lei Federal nº 14.133/2021, com experiência prática em instrução de processos municipais. Elabore o conteúdo de um Documento de Contratação Direta para o Município de São Francisco/SP.\n\nFINALIDADE:\nO documento será o documento específico da contratação direta. Não produza DFD, ETP ou TR neste fluxo. Produza texto formal, impessoal, juridicamente fundamentado, objetivo e operacional.\n\nREGRAS JURÍDICAS E DE FIDELIDADE:\n1. Use a Lei nº 14.133/2021 como referência central e considere sua redação vigente, sem inventar artigo, inciso, alínea ou limitação financeira.\n2. O FUNDAMENTO_CONTRATACAO_DIRETA deve reproduzir ou estruturar o fundamento informado pelo usuário. Se o fundamento legal não tiver sido informado, escreva exatamente: "Fundamento legal não informado no briefing; conferir e preencher antes da assinatura."\n3. NÃO invente número de processo, fornecedor, CNPJ, data, prazo de recebimento de propostas, valor contratado, cotação, pesquisa de preços, parecer, autorização ou publicação.\n4. Diferencie claramente valor estimado da contratação e eventual valor contratado.\n5. Não declare que documentos do art. 72 foram efetivamente juntados se isso não estiver nos dados. Apresente apenas uma orientação de instrução processual, identificando o que deve ser conferido.\n6. Na RAZAO/CRITERIOS de escolha do fornecedor, produza critérios e fundamentação para seleção objetiva. Não atribua a um fornecedor específico características que não foram fornecidas.\n7. Para a forma de processamento, respeite a modalidade informada: ${modalidadeNome}. Não invente regras específicas da plataforma ou prazos não fornecidos.\n8. Preserve integralmente os fatos fornecidos nas instruções do usuário.\n9. O texto deve ser específico para contratação direta; não trate o procedimento como pregão ou licitação ordinária.\n10. Retorne EXCLUSIVAMENTE um único objeto JSON válido, sem markdown ou comentários. Nenhum valor deve ser vazio.\n\nDADOS DO USUÁRIO:\n__LICITA_PIPE_DADOS_USUARIO__\n\nINSTRUÇÕES DO USUÁRIO (OBRIGATÓRIAS — prevalecem sobre diretrizes de estilo e tamanho, mas não sobre legalidade ou fidelidade aos fatos):\n${instrucoesUsuario?.trim() || "Nenhuma instrução adicional."}\n\nLembrete obrigatório: aplique as instruções do usuário no documento inteiro e não invente fatos.\n\nESTRUTURA JSON OBRIGATÓRIA:\n{\n  "FUNDAMENTO_CONTRATACAO_DIRETA": "",\n  "JUSTIFICATIVA_CONTRATACAO_DIRETA": "",\n  "INSTRUCAO_ART72": "",\n  "CRITERIOS_ESCOLHA_FORNECEDOR": "",\n  "CONDICOES_CONTRATACAO": "",\n  "PUBLICIDADE_TRANSPARENCIA": "",\n  "CONCLUSAO_CONTRATACAO_DIRETA": ""\n}`;
}

export const gerarFasePreparatoria = async (dados: any, arquivos?: DocumentosReferenciaUpload): Promise<FasePreparatoriaJob> => {
  if (!BASE_URL) throw new Error("API do Licita.AI não configurada.");

  const dadosOriginais = { ...(dados?.dados_usuario || {}) } as Record<string, any>;
  const dadosUsuario = mapearDadosWizard(dadosOriginais) as Record<string, string>;
  const instrucoes = String(dados?.instrucoes || "").trim();
  const meeppExclusivo = dadosUsuario["{{ME_EPP}}"] === "SIM";
  const modelo = "unsloth-auto";

  const modalidade = String(dadosUsuario["{{MODALIDADE}}"] || "").trim().toUpperCase();
  const pagamentoTipo = String(dadosOriginais?.pagamentoTipo || "CONFORME_ENTREGAS").trim().toUpperCase();
  const pagamentoEtapasRaw = String(dadosOriginais?.pagamentoEtapas || "").trim();
  const ehContratacaoDireta = ["DISPENSA_EMAIL", "DISPENSA_BLL"].includes(modalidade);
  const etapas: Array<{ id: string; tipo: string; prompt: string; temperature?: number }> = [];

  const itensJson = dadosUsuario["{{ITENS}}"];
  let itens: any[] = [];
  if (typeof itensJson === "string") {
    try { itens = JSON.parse(itensJson.replace(/^__TABLE__/, "")); } catch { itens = []; }
  } else if (Array.isArray(itensJson)) {
    itens = itensJson;
  }

  if (itens.length > 0) {
    etapas.push({
      id: "AUDITORIA_MARCAS",
      tipo: "auditoria_marcas",
      temperature: 0,
      prompt: construirPromptAuditoriaMarcas(itens, instrucoes),
    });
  }

  if (pagamentoTipo === "POR_ETAPAS") {
    if (!pagamentoEtapasRaw) throw new Error("Informe como será o pagamento por etapas antes de confeccionar os documentos.");
    etapas.push({
      id: "PAGAMENTO_ETAPAS",
      tipo: "geracao_json",
      temperature: 0,
      prompt: construirPromptPagamentoEtapas(pagamentoEtapasRaw),
    });
  }

  if (ehContratacaoDireta) {
    etapas.push({
      id: "CONTRATACAO_DIRETA",
      tipo: "geracao_contratacao_direta",
      temperature: 0.3,
      prompt: construirPromptContratacaoDireta(dadosParaPrompt(dadosUsuario), instrucoes, modalidade),
    });
  } else {
    const promptEtapa = (etapa: "DFD" | "ETP" | "TR") =>
      construirPrompt(dadosUsuario, meeppExclusivo, etapa, instrucoes, true);
    etapas.push({ id: "DFD", tipo: "geracao_json", temperature: 0.3, prompt: promptEtapa("DFD") });
    etapas.push({
      id: "ETP",
      tipo: "geracao_json",
      temperature: 0.3,
      prompt: promptEtapa("ETP").replace(
        "ESTRUTURA JSON OBRIGATÓRIA:",
        "CONTEXTO OBRIGATÓRIO DO DFD JÁ GERADO (preserve fatos e decisões coerentes):\n__LICITA_PIPE_DFD__\n\nESTRUTURA JSON OBRIGATÓRIA:",
      ),
    });
    etapas.push({
      id: "TR",
      tipo: "geracao_json",
      temperature: 0.3,
      prompt: promptEtapa("TR").replace(
        "ESTRUTURA JSON OBRIGATÓRIA:",
        "CONTEXTO OBRIGATÓRIO DO ETP JÁ GERADO (derive REQUISITOS_TR dos documentos adicionais listados em REQUISITOS_ETP, numerando a partir do Documento 13):\n__LICITA_PIPE_ETP__\n\nESTRUTURA JSON OBRIGATÓRIA:",
      ),
    });
  }

  const payload = {
    email: dados.email,
    instrucoes,
    dados_usuario: dadosUsuario,
    dados_ia: { __LICITA_PIPELINE__: { version: 5, model: modelo, temperature: 0.3, eh_contratacao_direta: ehContratacaoDireta, etapas } },
  };

  const anexos = arquivos || {};
  const uploads: Array<[keyof DocumentosReferenciaUpload, File | null | undefined]> = [
    ["dfd", anexos.dfd],
    ["etp", anexos.etp],
    ["tr", anexos.tr],
    ["edital", anexos.edital],
  ];
  const haUploads = uploads.some(([, arquivo]) => ehArquivoUpload(arquivo));

  let requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };

  if (haUploads) {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    for (const [campo, arquivo] of uploads) {
      if (ehArquivoUpload(arquivo)) formData.append(campo, arquivo, arquivo.name);
    }
    requestInit = {
      method: "POST",
      body: formData,
    };
  }

  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, requestInit);
  if (!response.ok) {
    let detalhe = "Falha ao colocar a geração na fila.";
    try { const erroJson = await response.json(); detalhe = erroJson?.detail || detalhe; } catch {}
    throw new Error(detalhe);
  }

  return response.json();
};

export interface AdminJob {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed" | "cancelled" | "cancelling" | string;
  email: string;
  objeto: string;
  created_at?: string | null;
  started_at?: string | null;
  last_attempt_started_at?: string | null;
  completed_at?: string | null;
  last_error_at?: string | null;
  current_stage?: string | null;
  attempts: number;
  resolved_model?: string | null;
  completed_stages?: string[];
  retry_at?: string | null;
  cancel_requested?: boolean;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  max_attempts?: number;
  retry_of?: string | null;
  last_error?: string;
  result?: { filename?: string; recipient?: string } | null;
  queue_wait_seconds?: number | null;
  processing_seconds?: number | null;
  elapsed_seconds?: number | null;
  attempt_history?: Array<Record<string, any>>;
  stage_history?: Array<Record<string, any>>;
  failure_notification?: Record<string, any> | null;
}

export interface AdminJobDetails extends AdminJob {
  instrucoes: string;
  dados_usuario: Record<string, unknown>;
  dados_usuario_processados: Record<string, unknown>;
  etapas_planejadas: string[];
}

async function respostaAdmin<T>(response: Response): Promise<T> {
  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const erro = new Error(payload?.detail || "Não foi possível concluir a operação administrativa.") as Error & { status?: number };
    erro.status = response.status;
    throw erro;
  }
  return payload as T;
}

export async function autenticarAdminPedidos(password: string): Promise<{ token: string; expires_in: number }> {
  if (!BASE_URL) throw new Error("API do Licita.AI não configurada.");
  const response = await fetch(BASE_URL + "/licita/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return respostaAdmin<{ token: string; expires_in: number }>(response);
}

export async function listarAdminPedidos(
  token: string,
  status = "todos",
  q = "",
): Promise<{ items: AdminJob[]; total: number; generated_at: string }> {
  const params = new URLSearchParams({ status, limit: "300" });
  if (q.trim()) params.set("q", q.trim());
  const response = await fetch(BASE_URL + "/licita/api/admin/jobs?" + params.toString(), {
    headers: { Authorization: "Bearer " + token },
  });
  return respostaAdmin(response);
}

export async function detalharAdminPedido(token: string, jobId: string): Promise<AdminJobDetails> {
  const response = await fetch(BASE_URL + "/licita/api/admin/jobs/" + encodeURIComponent(jobId), {
    headers: { Authorization: "Bearer " + token },
  });
  return respostaAdmin(response);
}

export async function refazerAdminPedido(
  token: string,
  jobId: string,
): Promise<{ job_id: string; status: string; email: string; message: string; retry_of?: string }> {
  const response = await fetch(BASE_URL + "/licita/api/admin/jobs/" + encodeURIComponent(jobId) + "/retry", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  return respostaAdmin(response);
}

