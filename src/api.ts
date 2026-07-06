export const API_URL = import.meta.env.PROD 
  ? 'https://danihmorais-github-io.onrender.com' 
  : 'http://localhost:8000';

export async function enviarParaProcessamento(file: File, modelo: string): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('modelo', modelo);

  const response = await fetch(`${API_URL}/api/processar`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `documento_gerado.docx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}