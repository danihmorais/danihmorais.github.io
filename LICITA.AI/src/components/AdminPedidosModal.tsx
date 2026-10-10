import React, { useCallback, useEffect, useState } from "react";
import {
  autenticarAdminPedidos,
  detalharAdminPedido,
  listarAdminPedidos,
  refazerAdminPedido,
  type AdminJob,
  type AdminJobDetails,
} from "../api";

interface AdminPedidosModalProps {
  onClose: () => void;
}

function formatarData(valor?: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(data);
}

function formatarDuracao(segundos?: number | null): string {
  if (segundos === undefined || segundos === null || !Number.isFinite(segundos)) return "—";
  const total = Math.max(0, Math.floor(segundos));
  if (total < 60) return total + " s";
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  if (horas > 0) return horas + " h " + minutos + " min";
  if (minutos > 0) return minutos + " min " + resto + " s";
  return total + " s";
}

function rotuloStatus(status: string): string {
  switch (status) {
    case "queued": return "Na fila";
    case "processing": return "Processando";
    case "sent": return "Concluído";
    case "failed": return "Falha";
    default: return status || "Desconhecido";
  }
}

function formatarNomeCampo(chave: string): string {
  return chave
    .replace(/[{}]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/^./, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

function resumirValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return JSON.stringify(valor);
  const texto = String(valor);
  return texto.length > 700 ? texto.slice(0, 700) + "… [conteúdo abreviado]" : texto;
}

function MensagemEstado({ texto }: { texto: string }) {
  return <div className="admin-empty-state">{texto}</div>;
}

export default function AdminPedidosModal({ onClose }: AdminPedidosModalProps) {
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [itens, setItens] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [detalheCarregando, setDetalheCarregando] = useState<string | null>(null);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<AdminJobDetails | null>(null);
  const [confirmarRefazer, setConfirmarRefazer] = useState<string | null>(null);
  const [refazendo, setRefazendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregarPedidos = useCallback(async (sessao: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await listarAdminPedidos(sessao, statusFiltro, busca);
      setItens(resposta.items);
      setTotal(resposta.total);
    } catch (falha: unknown) {
      const mensagem = falha instanceof Error ? falha.message : "Não foi possível carregar os pedidos.";
      setErro(mensagem);
      if (mensagem.toLowerCase().includes("sessão administrativa") || mensagem.toLowerCase().includes("expirada")) {
        setToken("");
        setItens([]);
        setPedidoSelecionado(null);
      }
    } finally {
      setCarregando(false);
    }
  }, [statusFiltro, busca]);

  useEffect(() => {
    if (token) void carregarPedidos(token);
  }, [token, carregarPedidos]);

  const entrar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const resposta = await autenticarAdminPedidos(senha);
      setSenha("");
      setToken(resposta.token);
      setAviso(null);
    } catch (falha: unknown) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível autenticar.");
    } finally {
      setEntrando(false);
    }
  };

  const abrirDetalhes = async (jobId: string) => {
    if (pedidoSelecionado?.job_id === jobId) {
      setPedidoSelecionado(null);
      return;
    }
    setDetalheCarregando(jobId);
    setErro(null);
    try {
      const detalhe = await detalharAdminPedido(token, jobId);
      setPedidoSelecionado(detalhe);
      setConfirmarRefazer(null);
    } catch (falha: unknown) {
      const mensagem = falha instanceof Error ? falha.message : "Não foi possível abrir os detalhes.";
      setErro(mensagem);
      if (mensagem.toLowerCase().includes("sessão administrativa") || mensagem.toLowerCase().includes("expirada")) {
        setToken("");
        setItens([]);
      }
    } finally {
      setDetalheCarregando(null);
    }
  };

  const refazer = async (pedido: AdminJob) => {
    setRefazendo(pedido.job_id);
    setErro(null);
    setAviso(null);
    try {
      const novo = await refazerAdminPedido(token, pedido.job_id);
      setConfirmarRefazer(null);
      setPedidoSelecionado(null);
      setStatusFiltro("todos");
      setBusca("");
      setBuscaDigitada("");
      setAviso("Nova execução criada: " + novo.job_id.slice(0, 8) + ". O registro da falha original foi preservado.");
      await carregarPedidos(token);
    } catch (falha: unknown) {
      const mensagem = falha instanceof Error ? falha.message : "Não foi possível refazer o pedido.";
      setErro(mensagem);
      if (mensagem.toLowerCase().includes("sessão administrativa") || mensagem.toLowerCase().includes("expirada")) {
        setToken("");
        setItens([]);
      }
    } finally {
      setRefazendo(null);
    }
  };

  const encerrarSessao = () => {
    setToken("");
    setItens([]);
    setPedidoSelecionado(null);
    setConfirmarRefazer(null);
    setBusca("");
    setBuscaDigitada("");
    setStatusFiltro("todos");
    setErro(null);
    setAviso(null);
  };

  return (
    <div
      className="admin-pedidos-overlay"
      role="presentation"
      onMouseDown={(evento) => { if (evento.target === evento.currentTarget) onClose(); }}
    >
      <section
        className="admin-pedidos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-pedidos-title"
      >
        <header className="admin-pedidos-header">
          <div>
            <span className="prompt-eyebrow">ÁREA RESTRITA</span>
            <h2 id="admin-pedidos-title">Pedidos do LICITA.AI</h2>
            <p>Histórico de solicitações, processamento e envio por e-mail.</p>
          </div>
          <button type="button" className="prompt-close" onClick={onClose} aria-label="Fechar painel">×</button>
        </header>

        {!token ? (
          <form className="admin-login-form" onSubmit={entrar}>
            <div className="admin-lock-mark" aria-hidden="true">⌑</div>
            <h3>Acesso administrativo</h3>
            <p>Informe a senha administrativa configurada no servidor.</p>
            <label className="prompt-field">
              Senha
              <input
                type="password"
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>
            {erro && <p className="admin-feedback admin-feedback-error" role="alert">{erro}</p>}
            <div className="admin-login-actions">
              <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="button button-primary" disabled={entrando || !senha}>
                {entrando ? "Validando…" : "Entrar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="admin-toolbar">
              <form className="admin-search" onSubmit={(evento) => { evento.preventDefault(); setBusca(buscaDigitada.trim()); }}>
                <input
                  type="search"
                  value={buscaDigitada}
                  onChange={(evento) => setBuscaDigitada(evento.target.value)}
                  placeholder="Buscar por objeto, e-mail ou ID"
                  aria-label="Buscar pedidos"
                />
                <button type="submit" className="button button-secondary">Buscar</button>
              </form>
              <div className="admin-toolbar-actions">
                <select aria-label="Filtrar por status" value={statusFiltro} onChange={(evento) => setStatusFiltro(evento.target.value)}>
                  <option value="todos">Todos os status</option>
                  <option value="queued">Na fila</option>
                  <option value="processing">Processando</option>
                  <option value="sent">Concluídos</option>
                  <option value="failed">Com falha</option>
                </select>
                <button type="button" className="button button-secondary" onClick={() => void carregarPedidos(token)} disabled={carregando}>
                  {carregando ? "Atualizando…" : "Atualizar"}
                </button>
                <button type="button" className="button button-quiet" onClick={encerrarSessao}>Sair</button>
              </div>
            </div>

            {erro && <p className="admin-feedback admin-feedback-error" role="alert">{erro}</p>}
            {aviso && <p className="admin-feedback admin-feedback-success" role="status">{aviso}</p>}

            <div className="admin-list-summary">
              <span>{total} {total === 1 ? "pedido encontrado" : "pedidos encontrados"}</span>
              <span>Até 300 registros por consulta · horários no fuso local do navegador</span>
            </div>

            {carregando && itens.length === 0 ? (
              <MensagemEstado texto="Carregando solicitações…" />
            ) : itens.length === 0 ? (
              <MensagemEstado texto="Nenhum pedido encontrado para este filtro." />
            ) : (
              <div className="admin-jobs-list">
                {itens.map((pedido) => (
                  <article className="admin-job-card" key={pedido.job_id}>
                    <div className="admin-job-card-main">
                      <div className="admin-job-heading">
                        <span className={"admin-status-pill admin-status-" + pedido.status}>{rotuloStatus(pedido.status)}</span>
                        <span className="admin-job-id" title={pedido.job_id}>{pedido.job_id.slice(0, 8)}</span>
                      </div>
                      <h3>{pedido.objeto || "Objeto não informado"}</h3>
                      <p className="admin-job-email">{pedido.email || "Destinatário não registrado"}</p>
                      <div className="admin-job-meta">
                        <span><strong>Solicitado:</strong> {formatarData(pedido.created_at)}</span>
                        <span><strong>Tempo total:</strong> {formatarDuracao(pedido.elapsed_seconds)}</span>
                        <span><strong>Processamento:</strong> {formatarDuracao(pedido.processing_seconds)}</span>
                        <span><strong>Tentativas:</strong> {pedido.attempts}</span>
                      </div>
                      {pedido.status === "failed" && pedido.last_error && (
                        <p className="admin-job-error-preview">{pedido.last_error}</p>
                      )}
                    </div>
                    <div className="admin-job-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void abrirDetalhes(pedido.job_id)}
                        disabled={detalheCarregando === pedido.job_id}
                      >
                        {detalheCarregando === pedido.job_id ? "Abrindo…" : pedidoSelecionado?.job_id === pedido.job_id ? "Ocultar detalhes" : "Detalhes"}
                      </button>
                      {pedido.status === "failed" && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => setConfirmarRefazer(confirmarRefazer === pedido.job_id ? null : pedido.job_id)}
                          disabled={refazendo === pedido.job_id}
                        >
                          Refazer
                        </button>
                      )}
                    </div>
                    {confirmarRefazer === pedido.job_id && (
                      <div className="admin-retry-confirm">
                        <p>Será criada uma nova execução para <strong>{pedido.email}</strong>. O histórico da falha original será mantido. Se o e-mail tiver sido entregue antes de uma falha de comunicação, poderá ocorrer reenvio duplicado.</p>
                        <div>
                          <button type="button" className="button button-quiet" onClick={() => setConfirmarRefazer(null)}>Cancelar</button>
                          <button type="button" className="button button-primary" onClick={() => void refazer(pedido)} disabled={refazendo === pedido.job_id}>
                            {refazendo === pedido.job_id ? "Enfileirando…" : "Confirmar e refazer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {pedidoSelecionado && (
              <section className="admin-detail-panel" aria-labelledby="admin-detail-title">
                <div className="admin-detail-heading">
                  <div>
                    <span className="prompt-eyebrow">DETALHES DO PEDIDO</span>
                    <h3 id="admin-detail-title">{pedidoSelecionado.objeto || "Pedido " + pedidoSelecionado.job_id.slice(0, 8)}</h3>
                  </div>
                  <button type="button" className="button button-quiet" onClick={() => setPedidoSelecionado(null)}>Fechar detalhes</button>
                </div>
                <dl className="admin-detail-grid">
                  <div><dt>Destinatário</dt><dd>{pedidoSelecionado.email || "—"}</dd></div>
                  <div><dt>ID completo</dt><dd><code>{pedidoSelecionado.job_id}</code></dd></div>
                  <div><dt>Entrada na fila</dt><dd>{formatarData(pedidoSelecionado.created_at)}</dd></div>
                  <div><dt>Primeiro início</dt><dd>{formatarData(pedidoSelecionado.started_at)}</dd></div>
                  <div><dt>Última tentativa</dt><dd>{formatarData(pedidoSelecionado.last_attempt_started_at)}</dd></div>
                  <div><dt>Conclusão</dt><dd>{formatarData(pedidoSelecionado.completed_at || pedidoSelecionado.last_error_at)}</dd></div>
                  <div><dt>Tempo total</dt><dd>{formatarDuracao(pedidoSelecionado.elapsed_seconds)}</dd></div>
                  <div><dt>Tempo processando</dt><dd>{formatarDuracao(pedidoSelecionado.processing_seconds)}</dd></div>
                  <div><dt>Etapa atual/final</dt><dd>{pedidoSelecionado.current_stage || "—"}</dd></div>
                  <div><dt>Modelo resolvido</dt><dd>{pedidoSelecionado.resolved_model || "Não registrado"}</dd></div>
                  <div><dt>Refaz pedido</dt><dd>{pedidoSelecionado.retry_of || "Solicitação original"}</dd></div>
                  <div><dt>Documento enviado</dt><dd>{pedidoSelecionado.result?.filename || "—"}</dd></div>
                </dl>

                {pedidoSelecionado.last_error && (
                  <div className="admin-detail-section">
                    <h4>Último erro</h4>
                    <pre className="admin-json-block admin-error-block">{pedidoSelecionado.last_error}</pre>
                  </div>
                )}
                {pedidoSelecionado.instrucoes && (
                  <div className="admin-detail-section">
                    <h4>Instruções adicionais</h4>
                    <p className="admin-detail-text">{pedidoSelecionado.instrucoes}</p>
                  </div>
                )}
                {pedidoSelecionado.etapas_planejadas?.length > 0 && (
                  <div className="admin-detail-section">
                    <h4>Etapas planejadas</h4>
                    <p className="admin-detail-text">{pedidoSelecionado.etapas_planejadas.join(" · ")}</p>
                  </div>
                )}
                {pedidoSelecionado.stage_history?.length > 0 && (
                  <div className="admin-detail-section">
                    <h4>Histórico das etapas</h4>
                    <div className="admin-history-list">
                      {pedidoSelecionado.stage_history.map((etapa, indice) => (
                        <div className="admin-history-row" key={String(etapa.stage) + "-" + indice}>
                          <div>
                            <strong>{String(etapa.stage || "Etapa")}</strong>
                            <span>{formatarData(etapa.started_at)} → {formatarData(etapa.ended_at)}</span>
                          </div>
                          <span className={"admin-status-pill admin-status-" + String(etapa.status || "unknown")}>{rotuloStatus(String(etapa.status || "desconhecido"))}</span>
                          <span>{formatarDuracao(typeof etapa.duration_seconds === "number" ? etapa.duration_seconds : null)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pedidoSelecionado.dados_usuario && Object.keys(pedidoSelecionado.dados_usuario).length > 0 && (
                  <details className="admin-detail-section admin-data-details">
                    <summary>Dados enviados no formulário</summary>
                    <dl className="admin-user-data">
                      {Object.entries(pedidoSelecionado.dados_usuario).map(([chave, valor]) => (
                        <div key={chave}>
                          <dt>{formatarNomeCampo(chave)}</dt>
                          <dd>{resumirValor(valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}
