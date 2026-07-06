const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export interface EditalPayload {
  tipo_edital: string;
  dados_preenchimento: Record<string, any>;
}

export const gerarEditalApi = async (payload: EditalPayload): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/gerar-edital`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Erro do servidor: ${response.statusText}`);
    }

    // Recebe o arquivo .zip bruto
    const blob = await response.blob();
    
    // Cria um link temporário para forçar o download no navegador
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Extrai o nome do arquivo que vem nos headers (se existir) ou usa o padrão
    const contentDisposition = response.headers.get("Content-Disposition");
    let fileName = "Editais_Gerados.zip";
    if (contentDisposition && contentDisposition.includes("filename=")) {
      fileName = contentDisposition.split("filename=")[1].replace(/"/g, "");
    }
    
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Limpeza da memória do navegador
    link.remove();
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Erro na comunicação com a API:", error);
    throw error;
  }
};