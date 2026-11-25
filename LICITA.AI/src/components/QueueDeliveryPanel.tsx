import { useEffect, useState } from "react";
import {
  baixarZipFila,
  consultarFilaFasePreparatoria,
  reenviarFilaFasePreparatoria,
} from "../api";

type Props = {
  jobId: string;
  statusToken: string;
  onResent: (job: { job_id: string; status_token: string }) => void;
  onStatusChange?: (job: JobStatus) => void;
};

type JobStatus = {
  status?: string;
  etapa_atual?: string;
  current_stage?: string;
  message?: string;
  download_available?: boolean;
  can_resend?: boolean;
};

export default function QueueDeliveryPanel({ jobId, statusToken, onResent, onStatusChange }: Props) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
        onStatusChange?.(status as JobStatus);
        const finalizado = ["sent", "failed", "cancelled"].includes(String(status.status || "").toLowerCase());
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
  }, [jobId, statusToken, onStatusChange]);

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
  const semAcaoDisponivel = !job?.download_available && !job?.can_resend && !error;

  if (semAcaoDisponivel) return null;

  return (
    <section className="queue-delivery-panel" aria-live="polite">
      <div className="queue-delivery-heading">
        <strong>Acompanhamento da solicitação</strong>
        <span className={`queue-delivery-status status-${status || "loading"}`}>
          {status === "sent" ? "Concluída" : status === "failed" ? "Falha" : status === "cancelled" ? "Cancelada" : status === "processing" ? "Em processamento" : status === "queued" ? "Na fila" : "Consultando"}
        </span>
      </div>
      {job?.message && status !== "failed" && <p>{job.message}</p>}
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
      </div>
      {notice && <p className="queue-delivery-notice" role="status">{notice}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}
