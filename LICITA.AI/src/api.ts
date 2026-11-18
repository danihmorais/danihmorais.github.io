import { mapearDadosWizard } from "./utils/mapearDados";
import { getApiBaseUrl } from "./utils/apiBase";

const BASE_URL = getApiBaseUrl();

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
  const headers: Record<string, string> = {};
  if (statusToken) headers["X-Status-Token"] = statusToken;
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}`, { headers });
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
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}/cancelar`, { method: "POST", headers: { "X-Status-Token": statusToken } });
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

export const gerarFasePreparatoria = async (dados: any, arquivos?: DocumentosReferenciaUpload): Promise<FasePreparatoriaJob> => {
  if (!BASE_URL) throw new Error("API do Licita.AI não configurada.");

  const dadosOriginais = { ...(dados?.dados_usuario || {}) } as Record<string, any>;
  const dadosUsuario = mapearDadosWizard(dadosOriginais) as Record<string, string>;
  const instrucoes = String(dados?.instrucoes || "").trim();
  const pagamentoTipo = String(dadosOriginais?.pagamentoTipo || "CONFORME_ENTREGAS").trim().toUpperCase();
  const pagamentoEtapasRaw = String(dadosOriginais?.pagamentoEtapas || "").trim();
  if (pagamentoTipo === "POR_ETAPAS" && !pagamentoEtapasRaw) {
    throw new Error("Informe como será o pagamento por etapas antes de confeccionar os documentos.");
  }

  const payload = {
    email: dados.email,
    instrucoes,
    dados_usuario: dadosUsuario,
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

export async function excluirAdminPedido(
  token: string,
  jobId: string,
): Promise<{ job_id: string; deleted: boolean; message: string }> {
  const response = await fetch(BASE_URL + "/licita/api/admin/jobs/" + encodeURIComponent(jobId), {
    method: "DELETE",
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

