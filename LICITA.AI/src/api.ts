const BASE_URL = import.meta.env.VITE_API_URL;

interface FasePreparatoriaResult { blob: Blob; filename: string; }

export const gerarFasePreparatoria = async (dados: any): Promise<FasePreparatoriaResult> => {
  const response = await fetch(`${BASE_URL}/licita/api/gerar-fase-preparatoria`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
  });
  if (!response.ok) {
    let detalhe = 'Falha ao gerar o documento.';
    try { const erroJson = await response.json(); detalhe = erroJson?.detail || detalhe; } catch {}
    throw new Error(detalhe);
  }
  const blob = await response.blob();
  let filename = 'documento.zip';
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) { const match = disposition.match(/filename="?([^";]+)"?/); if (match?.[1]) filename = match[1]; }
  return { blob, filename };
};
