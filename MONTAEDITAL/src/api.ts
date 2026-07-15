const BASE_URL = import.meta.env.VITE_API_URL || 'https://danihmorais-github-io.onrender.com/api';

interface EditalResult {
  blob: Blob;
  filename: string;
}

export const gerarEdital = async (dados: any): Promise<EditalResult> => {
  const response = await fetch(`${BASE_URL}/gerar-edital`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });

  if (!response.ok) {
    // O backend pode mandar um corpo JSON com detalhe do erro (HTTPException do FastAPI)
    let detalhe = 'Falha ao gerar o Edital.';
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {
      // corpo de erro não era JSON, mantém mensagem genérica
    }
    throw new Error(detalhe);
  }

  const blob = await response.blob();

  let filename = 'editais.zip';
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];
  }

  return { blob, filename };
};