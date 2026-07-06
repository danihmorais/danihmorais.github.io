import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

const REPO_URL = "https://api.github.com/repos/danihmorais/EDITAL/releases/latest";

export async function verificarAtualizacao(
  setAguardandoUpdate: (estado: boolean) => void
) {
  try {
    let currentVersion;
    try {
      currentVersion = await getVersion();
    } catch (err) {
      throw new Error(`Permissão negada ou erro em getVersion(): ${err}`);
    }

    let res;
    try {
      res = await fetch(REPO_URL);
    } catch (err) {
      throw new Error(`Falha de rede (Bloqueio de Firewall/Antivírus ou CORS): ${err}`);
    }

    if (!res.ok) {
      alert(`Falha na API do GitHub. Status HTTP: ${res.status}`);
      return;
    }

    const data = await res.json();

    if (!data || !data.tag_name) {
      throw new Error("Resposta inválida do GitHub (tag_name ausente).");
    }

    const latestTag = data.tag_name;
    const cleanTag = latestTag.replace("v", "");

    if (cleanTag === currentVersion) {
      alert(`Você já está na versão mais recente (${currentVersion}).`);
      return;
    }

    if (!data.assets || !Array.isArray(data.assets)) {
      throw new Error("Resposta inválida do GitHub (assets ausentes).");
    }

    const asset = data.assets.find((a: any) =>
      a.name.toLowerCase().endsWith(".exe")
    );

    if (!asset) {
      alert("Nenhum executável encontrado na release.");
      return;
    }

    const dataPub = new Date(data.published_at).toLocaleDateString("pt-BR");

    const confirmar = window.confirm(
      `Nova versão disponível: ${latestTag}\nPublicada em: ${dataPub}\n\nDeseja baixar e aplicar a atualização agora?\n\nATENÇÃO: Salve todos os dados antes de continuar. A aplicação será reiniciada.`
    );

    if (!confirmar) return;

    setAguardandoUpdate(true);

    try {
      await invoke("aplicar_atualizacao", {
        url: asset.browser_download_url,
      });
    } catch (err) {
      throw new Error(`Erro no comando aplicar_atualizacao do backend: ${err}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Erro detalhado:", error);
    alert(`Erro: ${errorMessage}`);
    setAguardandoUpdate(false);
  }
}