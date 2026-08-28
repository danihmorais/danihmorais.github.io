const BASE_URL = import.meta.env.VITE_API_URL;

interface ExtratoResult {
  blob: Blob;
  filename: string;
}

export const gerarExtrato = async (dados: any): Promise<ExtratoResult> => {
  const response = await fetch(`${BASE_URL}/geradorextrato/api/gerar-extrato`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });

  if (!response.ok) {
    let detalhe = 'Falha ao gerar o Extrato.';
    try {
      const erroJson = await response.json();
      detalhe = erroJson?.detail || detalhe;
    } catch {
    }
    throw new Error(detalhe);
  }

  const blob = await response.blob();

  let filename = 'extrato.docx';
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];
  }

  return { blob, filename };
};
