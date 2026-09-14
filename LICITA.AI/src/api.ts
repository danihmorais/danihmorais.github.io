import { MODELO_PADRAO_POR_PROVEDOR } from "./providers/llm";
import { revisarMarcasItens, gerarDadosContratacaoDireta } from "./providers/services/contratacaoDiretaIA";
import { lerConfigIA } from "./utils/storageLocal";

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const POLLING_INTERVAL_MS = 2000;
const POLLING_TIMEOUT_MS = 20 * 60 * 1000;

export interface FasePreparatoriaJob {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed" | string;
  email: string;
  message?: string;
}

const MODALIDADES_CONTRATACAO_DIRETA = new Set(["DISPENSA_EMAIL", "DISPENSA_BLL"]);
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const consultarFilaFasePreparatoria = async (jobId: string) => {
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}`);
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

async function aguardarConclusao(jobId: string): Promise<any> {
  const inicio = Date.now();
  while (Date.now() - inicio < POLLING_TIMEOUT_MS) {
    const job = await consultarFilaFasePreparatoria(jobId);
    if (job.status === "sent") return job;
    if (job.status === "failed") {
      throw new Error(job.last_error || "O backend não conseguiu concluir a geração dos documentos.");
    }
    await esperar(POLLING_INTERVAL_MS);
  }
  throw new Error("A geração permaneceu na fila por mais de 20 minutos. Consulte a fila novamente antes de reenviar a solicitação.");
}

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaJob> => {
  const payload = {
    ...dados,
    dados_usuario: { ...(dados?.dados_usuario || {}) },
    dados_ia: { ...(dados?.dados_ia || {}) },
  };

  const itensJson = payload.dados_usuario?.["{{ITENS}}"];
  const itens = typeof itensJson === "string"
    ? (() => {
        try { return JSON.parse(itensJson.replace(/^__TABLE__/, "")); } catch { return []; }
      })()
    : (Array.isArray(itensJson) ? itensJson : []);

  const config = lerConfigIA();
  const apiKey = config.chave_api || "backend";
  const modelo = config.modelo || MODELO_PADRAO_POR_PROVEDOR.openrouter;

  const nomesJson = payload.dados_usuario?.ITENS_NOMES;
  if (itens.length > 0 && nomesJson) {
    const auditoria = await revisarMarcasItens(itens, payload.instrucoes || "", apiKey, modelo);
    payload.dados_usuario["{{ITENS}}"] = JSON.stringify(auditoria.itens);
    payload.dados_usuario.ITENS_NOMES = JSON.stringify(
      auditoria.itens.map((item: any, index: number) => ({
        numero: item?.numero ?? index + 1,
        nome: String(item?.descricao || "").trim(),
      })).filter((item: any) => item.nome)
    );
    payload.dados_ia.ITENS_AUDITORIA_MARCAS = JSON.stringify(auditoria.auditoria);
  }

  const modalidade = String(payload.dados_usuario?.["{{MODALIDADE}}"] || "").trim().toUpperCase();
  if (MODALIDADES_CONTRATACAO_DIRETA.has(modalidade)) {
    const dadosIaDireta = await gerarDadosContratacaoDireta(
      payload.dados_usuario,
      { FASE_PREPARATORIA: payload.dados_ia },
      payload.instrucoes || "",
      modalidade,
      apiKey,
      modelo,
    );
    payload.dados_ia = { ...payload.dados_ia, ...dadosIaDireta };
  }

  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detalhe = "Falha ao agendar a geração da Fase Preparatória.";
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {}
    throw new Error(detalhe);
  }

  const job = await response.json();
  const finalJob = await aguardarConclusao(job.job_id);
  return { ...job, ...finalJob };
};
