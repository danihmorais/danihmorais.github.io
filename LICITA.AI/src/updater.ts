import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

const REPO_URL = "https://api.github.com/repos/danihmorais/PRONTUARIO/releases/latest";

export async function verificarAtualizacao(
  setAguardandoUpdate: (estado: boolean) => void
) {
  try {
    const res = await fetch(REPO_URL);

    if (!res.ok) {
      alert("Não foi possível verificar atualizações.");
      return;
    }

    const data = await res.json();

    const latestTag = data.tag_name;
    const currentVersion = await getVersion();
    const cleanTag = latestTag.replace("v", "");

    if (cleanTag === currentVersion) {
      alert(`Você já está na versão mais recente (${currentVersion}).`);
      return;
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

    await invoke("aplicar_atualizacao", {
      url: asset.browser_download_url,
    });
  } catch (error) {
    console.error("Erro ao verificar atualização:", error);
    alert("Erro ao verificar atualização.\nVerifique sua conexão ou o repositório.");
    setAguardandoUpdate(false);
  }
}