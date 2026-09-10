const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export interface FasePreparatoriaJob {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed" | string;
  email: string;
  message: string;
}

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaJob> => {
  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });

  if (!response.ok) {
    let detalhe = "Falha ao agendar a geração da Fase Preparatória.";
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {
    }
    throw new Error(detalhe);
  }

  return response.json();
};

export const consultarFilaFasePreparatoria = async (jobId: string) => {
  const response = await fetch(`${BASE_URL}/licita/api/fila/${encodeURIComponent(jobId)}`);

  if (!response.ok) {
    let detalhe = "Não foi possível consultar a fila.";
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {
    }
    throw new Error(detalhe);
  }

  return response.json();
};
