const BASE_URL = import.meta.env.VITE_API_URL || 'https://danihmorais-github-io.onrender.com/licita/api';

interface FasePreparatoriaResult {
  blob: Blob;
  filename: string;
}

interface NvidiaChatPayload {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}

// A API da NVIDIA (integrate.api.nvidia.com) não envia headers de CORS,
// então a chamada precisa passar pelo nosso backend, que repassa a
// requisição server-side e devolve a resposta ao navegador.
export const chamarNvidiaChatCompletions = async (payload: NvidiaChatPayload): Promise<Response> => {
  return fetch(`${BASE_URL}/nvidia/chat-completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
};

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaResult> => {
  const response = await fetch(`${BASE_URL}/gerar-fase-preparatoria`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });

  if (!response.ok) {
    // O backend pode mandar um corpo JSON com detalhe do erro (HTTPException do FastAPI)
    let detalhe = 'Falha ao gerar a Fase Preparatoria.';
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {
      // corpo de erro não era JSON, mantém mensagem genérica
    }
    throw new Error(detalhe);
  }

  const blob = await response.blob();

  let filename = 'faseprepatoria.zip';
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];
  }

  return { blob, filename };
};
