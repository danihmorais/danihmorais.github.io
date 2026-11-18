import { useEffect, useState } from "react";
import {
  aprovarPreviewFila,
  baixarZipFila,
  consultarFilaFasePreparatoria,
  consultarPreviewFila,
  regenerarDocumentoPreviewFila,
  reenviarFilaFasePreparatoria,
  salvarCampoPreviewFila,
  type PreviewDocumentosFila,
} from "../api";

type Props = {
  jobId: string;
  statusToken: string;
  onResent: (job: { job_id: string; status_token: string }) => void;
  onDismiss: () => void;
};

type JobStatus = {
  status?: string;
  etapa_atual?: string;
  current_stage?: string;
  message?: string;
  download_available?: boolean;
  can_resend?: boolean;
};

export default function QueueDeliveryPanel({ jobId, statusToken, onResent, onDismiss }: Props) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PreviewDocumentosFila | null>(null);
  const [abrindoPreview, setAbrindoPreview] = useState(false);
  const [salvandoPreview, setSalvandoPreview] = useState(false);
  const [regenerandoDocumento, setRegenerandoDocumento] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [edicoes, setEdicoes] = useState<Record<string, Record<string, string>>>({});
  const [pollingNonce, setPollingNonce] = useState(0);
  const [previewAberto, setPreviewAberto] = useState(false);



  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intervalo = 4000;

    const consultar = async () => {
      if (!ativo) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(consultar, 8000);
        return;
      }
      try {
        const status = await consultarFilaFasePreparatoria(jobId, statusToken);
        if (!ativo) return;
        setJob(status as JobStatus);
        const finalizado = ["sent", "failed", "cancelled", "awaiting_review"].includes(String(status.status || "").toLowerCase());
        if (finalizado) return;
        intervalo = Math.min(30000, Math.round(intervalo * 1.5));
      } catch (erro: any) {
        if (!ativo) return;
        setError(erro?.message || "Não foi possível atualizar o acompanhamento.");
        intervalo = Math.min(60000, Math.round(intervalo * 2));
      }
      if (ativo) timer = setTimeout(consultar, intervalo);
    };

    const visibilidadeAlterada = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(consultar, 0);
      }
    };

    document.addEventListener("visibilitychange", visibilidadeAlterada);
    consultar();
    return () => {
      ativo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilidadeAlterada);
    };
  }, [jobId, statusToken, pollingNonce]);

  const atualizar = async () => {
    const status = await consultarFilaFasePreparatoria(jobId, statusToken);
    setJob(status as JobStatus);
  };

  const abrirPreview = async () => {
    setAbrindoPreview(true);
    setError("");
    setNotice("");
    try {
      const resultado = await consultarPreviewFila(jobId, statusToken);
      setPreview(resultado);
      setEdicoes({});
      setPreviewAberto(true);
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível abrir a pré-visualização.");
    } finally {
      setAbrindoPreview(false);
    }
  };

  const alterarCampo = (documento: "DFD" | "ETP" | "TR", campo: string, conteudo: string) => {
    setEdicoes(anterior => ({
      ...anterior,
      [documento]: { ...(anterior[documento] || {}), [campo]: conteudo },
    }));
  };

  const salvarEdicoes = async () => {
    if (!preview) return;
    setSalvandoPreview(true);
    setError("");
    setNotice("");
    try {
      for (const documento of ["DFD", "ETP", "TR"] as const) {
        for (const [campo, conteudo] of Object.entries(edicoes[documento] || {})) {
          await salvarCampoPreviewFila(jobId, statusToken, documento, campo, conteudo);
        }
      }
      const atualizado = await consultarPreviewFila(jobId, statusToken);
      setPreview(atualizado);
      setEdicoes({});
      setNotice("Alterações salvas. Revise o conteúdo antes de aprovar.");
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível salvar todas as alterações.");
    } finally {
      setSalvandoPreview(false);
    }
  };

  const regenerarDocumento = async (documento: "DFD" | "ETP" | "TR") => {
    setRegenerandoDocumento(documento);
    setError("");
    setNotice("");
    try {
      const resultado = await regenerarDocumentoPreviewFila(jobId, statusToken, documento);
      const atualizado = await consultarPreviewFila(jobId, statusToken);
      setPreview(atualizado);
      setEdicoes({});
      setNotice(resultado.message);
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível regenerar o documento.");
    } finally {
      setRegenerandoDocumento(null);
    }
  };

  const aprovar = async () => {
    setAprovando(true);
    setError("");
    setNotice("");
    try {
      await aprovarPreviewFila(jobId, statusToken);
      setJob({ status: "queued", current_stage: "MONTAGEM_DOCX" });
      setPollingNonce(valor => valor + 1);
      setPreviewAberto(false);
      setPreview(null);
      setNotice("Conteúdo aprovado. A montagem dos documentos foi retomada.");
      await atualizar();
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível aprovar os documentos.");
    } finally {
      setAprovando(false);
    }
  };

  const baixar = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const blob = await baixarZipFila(jobId, statusToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `LICITA.AI-${jobId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Download iniciado.");
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível baixar o ZIP.");
    } finally {
      setBusy(false);
    }
  };

  const reenviar = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const novo = await reenviarFilaFasePreparatoria(jobId, statusToken);
      onResent(novo);
      setNotice("O reenvio foi colocado na fila. Acompanhe a nova solicitação abaixo.");
    } catch (erro: any) {
      setError(erro?.message || "Não foi possível reenviar os documentos.");
    } finally {
      setBusy(false);
    }
  };

  const status = String(job?.status || "").toLowerCase();
  const etapa = job?.current_stage || job?.etapa_atual || "";
  const terminal = ["sent", "failed", "cancelled"].includes(status);
  const aguardandoRevisao = status === "awaiting_review";

  return (
    <section className="queue-delivery-panel" aria-live="polite">
      <div className="queue-delivery-heading">
        <strong>Acompanhamento da solicitação</strong>
        <span className={`queue-delivery-status status-${status || "loading"}`}>
          {status === "sent" ? "Concluída" : status === "failed" ? "Falha" : status === "cancelled" ? "Cancelada" : status === "processing" ? "Em processamento" : status === "queued" ? "Na fila" : status === "awaiting_review" ? "Aguardando revisão" : "Consultando"}
        </span>
      </div>
      <p>Solicitação: <code>{jobId}</code></p>
      {etapa && <p>Etapa atual: {etapa}</p>}
      {job?.message && <p>{job.message}</p>}
      {aguardandoRevisao && (
        <div className="queue-review-actions">
          <p>O conteúdo de DFD, ETP e TR foi gerado. Revise e aprove antes da montagem dos DOCX.</p>
          <button type="button" className="button button-primary" disabled={abrindoPreview || busy} onClick={abrirPreview}>
            {abrindoPreview ? "Carregando pré-visualização..." : "Revisar documentos"}
          </button>
        </div>
      )}
      {previewAberto && preview && (
        <div className="queue-review-editor">
          <div className="queue-review-editor-heading">
            <strong>Pré-visualização e edição dos documentos</strong>
            <button type="button" className="button button-ghost" onClick={() => setPreviewAberto(false)}>Fechar</button>
          </div>
          {preview.conformidade && (
            <details className="queue-conformity-report" open>
              <summary>Checklist automatizado de revisão — {preview.conformidade.summary.ok} OK · {preview.conformidade.summary.pendencias} pendência(s) · {preview.conformidade.summary.revisao} para revisão</summary>
              <ul className="queue-conformity-checks">
                {preview.conformidade.verificacoes.map(item => (
                  <li className={`queue-conformity-check status-${item.status}`} key={item.id}>
                    <strong>{item.status === "ok" ? "OK" : item.status === "alerta" ? "Pendência" : "Revisão humana"} — {item.titulo}</strong>
                    <span>{item.detalhe}</span>
                  </li>
                ))}
              </ul>
              {preview.conformidade.limites.map((limite, index) => <p className="queue-conformity-limit" key={index}>{limite}</p>)}
            </details>
          )}
          {(["DFD", "ETP", "TR"] as const).map(documento => (
            <details className="queue-review-document" key={documento} open>
              <summary>{documento}{preview.stale_documents?.includes(documento) ? " — precisa regenerar" : ""}</summary>
              <button type="button" className="button button-secondary queue-review-regenerate" disabled={!!regenerandoDocumento || salvandoPreview || aprovando} onClick={() => regenerarDocumento(documento)}>
                {regenerandoDocumento === documento ? "Regenerando..." : `Regenerar ${documento}`}
              </button>
              {Object.entries(preview.documentos[documento] || {}).map(([campo, conteudo]) => {
                const id = `review-${jobId}-${documento}-${campo}`;
                const valor = edicoes[documento]?.[campo] ?? conteudo;
                return (
                  <label className="queue-review-field" htmlFor={id} key={campo}>
                    <span>{campo.replaceAll("_", " ")}</span>
                    <textarea id={id} value={valor} rows={Math.min(14, Math.max(3, Math.ceil(valor.length / 100)))} onChange={evento => alterarCampo(documento, campo, evento.target.value)} />
                  </label>
                );
              })}
            </details>
          ))}
          {preview.stale_documents?.length ? <p role="alert">Documentos dependentes precisam ser regenerados: {preview.stale_documents.join(", ")}.</p> : null}
          <div className="queue-delivery-actions">
            <button type="button" className="button button-secondary" disabled={salvandoPreview || aprovando || !!regenerandoDocumento} onClick={salvarEdicoes}>
              {salvandoPreview ? "Salvando..." : "Salvar alterações"}
            </button>
            <button type="button" className="button button-primary" disabled={salvandoPreview || aprovando || !!preview.stale_documents?.length || Object.values(edicoes).some(campos => Object.values(campos).some(valor => !valor.trim()))} onClick={aprovar}>
              {aprovando ? "Aprovando..." : "Aprovar e montar DOCX"}
            </button>
          </div>
        </div>
      )}
      <div className="queue-delivery-actions">
        {job?.download_available && (
          <button type="button" className="button button-primary" disabled={busy} onClick={baixar}>
            Baixar ZIP
          </button>
        )}
        {job?.can_resend && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={reenviar}>
            Reenviar por e-mail
          </button>
        )}
        {terminal && (
          <button type="button" className="button button-ghost" disabled={busy} onClick={onDismiss}>
            Fechar acompanhamento
          </button>
        )}
      </div>
      {notice && <p className="queue-delivery-notice" role="status">{notice}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}
