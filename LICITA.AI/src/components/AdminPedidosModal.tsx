import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  autenticarAdminPedidos,
  cancelarAdminPedido,
  detalharAdminPedido,
  listarAdminPedidos,
  refazerAdminPedido,
  type AdminJob,
  type AdminJobDetails,
} from "../api";

interface AdminPedidosModalProps {
  onClose: () => void;
  sessaoInicial?: { token: string; expiraEm: number } | null;
  onSessaoChange?: (sessao: { token: string; expiraEm: number } | null) => void;
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
    case "sent":
    case "completed": return "Concluído";
    case "failed": return "Falha";
    case "cancelled": return "Cancelado";
    case "cancelling": return "Cancelando";
    case "retrying": return "Nova tentativa";
    case "unavailable": return "Indisponível";
    default: return status || "Desconhecido";
  }
}

function rotuloEtapa(status?: string | null): string {
  const nomes: Record<string, string> = {
    AGUARDANDO_FILA: "Aguardando na fila",
    AUDITORIA_MARCAS: "Auditoria de marcas",
    PAGAMENTO_ETAPAS: "Revisão do pagamento por etapas",
    DFD: "Geração do DFD",
    ETP: "Geração do ETP",
    TR: "Geração do TR",
    FASE_PREPARATORIA: "Geração dos documentos",
    CONTRATACAO_DIRETA: "Geração da contratação direta",
    GERACAO_DOCUMENTOS: "Montagem dos documentos",
    ENVIO_EMAIL: "Envio por e-mail",
  };
  return nomes[String(status || "").toUpperCase()] || String(status || "Não iniciada").replace(/_/g, " ");
}

function ehErroSessao(falha: unknown): boolean {
  return Number((falha as Error & { status?: number })?.status) === 401;
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

function resumirValor(valor: unknown, chave = ""): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (chave.includes("DOTACAO") || chave.includes("DOTAÇÃO")) {
    const texto = String(valor);
    const imagensJaSanitizadas = Number(texto.match(/(\d+)\s+imagem\(ns\)/i)?.[1] || 0);
    const imagensMarcadas = (texto.match(/__IMG__/g) || []).length + (texto.startsWith("data:image/") ? 1 : 0);
    const imagens = Math.max(imagensJaSanitizadas, imagensMarcadas);
    const temTexto = texto.includes("texto:") || texto.split(/\r?\n/).some((linha) => linha.trim() && !linha.trim().startsWith("__IMG__") && !linha.trim().startsWith("data:image/"));
    return [imagens ? `${imagens} imagem(ns)` : "", temTexto ? "texto" : ""].filter(Boolean).join(" + ") || "Não informado";
  }
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return Array.isArray(valor) ? `${valor.length} registro(s)` : Object.entries(valor as Record<string, unknown>).map(([nome, item]) => `${nome}: ${String(item ?? "—")}`).join("; ");
  const texto = String(valor);
  if (texto.startsWith("__IMG__") || texto.startsWith("data:image/")) return "[imagem anexada]";
  return texto.length > 700 ? texto.slice(0, 700) + "… [conteúdo abreviado]" : texto;
}

function chaveInterna(chave: string): boolean {
  const limpa = chave.replace(/[{}]/g, "").toUpperCase();
  return ["ITENS_NOMES", "PAGAMENTO_ETAPAS_RAW", "REQUISITOS_ETP_ANTERIOR", "CAMINHO_IMAGEM_DOTACAO", "CONTATOS_SECRETARIAS", "INSTRUCOES_EXTRAS"].includes(limpa)
    || limpa.startsWith("RAW_") || limpa.startsWith("__");
}

function lerItens(valor: unknown): any[] {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== "string") return [];
  try {
    const itens = JSON.parse(valor.replace(/^__TABLE__/, ""));
    return Array.isArray(itens) ? itens : [];
  } catch {
    return [];
  }
}

function moeda(valor: unknown): string {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function MensagemEstado({ texto }: { texto: string }) {
  return <div className="admin-empty-state">{texto}</div>;
}

export default function AdminPedidosModal({ onClose, sessaoInicial, onSessaoChange }: AdminPedidosModalProps) {
  const sessaoValida = Boolean(sessaoInicial?.token && sessaoInicial.expiraEm > Date.now());
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState(sessaoValida ? sessaoInicial!.token : "");
  const [expiraEm, setExpiraEm] = useState<number | null>(sessaoValida ? sessaoInicial!.expiraEm : null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ tipo: "refazer" | "cancelar"; id: string } | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [entrando, setEntrando] = useState(false);
  const [itens, setItens] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [detalheCarregando, setDetalheCarregando] = useState<string | null>(null);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<AdminJobDetails | null>(null);
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
      if (ehErroSessao(falha)) {
        setToken("");
        setExpiraEm(null);
        onSessaoChange?.(null);
        setItens([]);
        setPedidoSelecionado(null);
        setErro("Sessão expirada. Entre novamente.");
      }
    } finally {
      setCarregando(false);
    }
  }, [statusFiltro, busca]);

  useEffect(() => {
    if (token) void carregarPedidos(token);
  }, [token, carregarPedidos, refreshNonce]);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onCloseRef.current();
        return;
      }
      if (evento.key !== "Tab" || !dialogRef.current) return;
      const controles = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!controles.length) return;
      const primeiro = controles[0], ultimo = controles[controles.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      anterior?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const ativo = () => itens.some((item) => ["queued", "processing", "cancelling"].includes(String(item.status).toLowerCase()));
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && ativo()) {
        void carregarPedidos(token).then(() => setAtualizadoEm(new Date().toISOString()));
      }
      if (expiraEm !== null && expiraEm <= Date.now()) {
        setToken("");
        setExpiraEm(null);
        onSessaoChange?.(null);
        setErro("Sessão administrativa expirada. Entre novamente.");
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [token, expiraEm, itens, carregarPedidos, onSessaoChange]);

  const entrar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const resposta = await autenticarAdminPedidos(senha);
      const expiracao = Date.now() + Math.max(1, Number(resposta.expires_in) || 1800) * 1000;
      setSenha("");
      setToken(resposta.token);
      setExpiraEm(expiracao);
      onSessaoChange?.({ token: resposta.token, expiraEm: expiracao });
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
      setConfirmacao(null);
    } catch (falha: unknown) {
      const mensagem = falha instanceof Error ? falha.message : "Não foi possível abrir os detalhes.";
      setErro(mensagem);
      if (ehErroSessao(falha)) {
        setToken("");
        setExpiraEm(null);
        onSessaoChange?.(null);
        setItens([]);
        setErro("Sessão expirada. Entre novamente.");
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
      const filtrosJaPadrao = statusFiltro === "todos" && !busca;
      setConfirmacao(null);
      setPedidoSelecionado(null);
      setStatusFiltro("todos");
      setBusca("");
      setBuscaDigitada("");
      setAviso("Nova execução criada: " + novo.job_id.slice(0, 8) + ". O registro da falha original foi preservado.");
      if (filtrosJaPadrao) setRefreshNonce((valor) => valor + 1);
    } catch (falha: unknown) {
      const mensagem = falha instanceof Error ? falha.message : "Não foi possível refazer o pedido.";
      setErro(mensagem);
      if (ehErroSessao(falha)) {
        setToken("");
        setExpiraEm(null);
        onSessaoChange?.(null);
        setItens([]);
        setErro("Sessão expirada. Entre novamente.");
      }
    } finally {
      setRefazendo(null);
    }
  };

  const cancelar = async (pedido: AdminJob) => {
    setConfirmando(pedido.job_id);
    setErro(null);
    setAviso(null);
    try {
      const resultado = await cancelarAdminPedido(token, pedido.job_id);
      setConfirmacao(null);
      setPedidoSelecionado(null);
      setAviso(resultado.message);
      setRefreshNonce((valor) => valor + 1);
    } catch (falha: unknown) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível cancelar o pedido.");
      if (ehErroSessao(falha)) {
        setToken("");
        setExpiraEm(null);
        onSessaoChange?.(null);
        setItens([]);
        setErro("Sessão expirada. Entre novamente.");
      }
    } finally {
      setConfirmando(null);
    }
  };

  const encerrarSessao = () => {
    setToken("");
    setExpiraEm(null);
    onSessaoChange?.(null);
    setItens([]);
    setPedidoSelecionado(null);
    setConfirmacao(null);
    setBusca("");
    setBuscaDigitada("");
    setStatusFiltro("todos");
    setErro(null);
    setAviso(null);
  };

  const historicoEtapas = pedidoSelecionado?.stage_history ?? [];
  const renderValorFormulario = (chave: string, valor: unknown) => {
    const chaveLimpa = chave.replace(/[{}]/g, "").toUpperCase();
    if (chaveLimpa === "ITENS") {
      const itens = lerItens(valor);
      if (!itens.length) return "Nenhum item informado";
      return (
        <div className="admin-items-table-wrap">
          <table className="admin-items-table">
            <thead><tr><th>Nº</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Valor unit.</th></tr></thead>
            <tbody>
              {itens.map((item, indice) => (
                <tr key={String(item.numero ?? indice + 1) + "-" + indice}>
                  <td>{item.numero ?? indice + 1}</td>
                  <td>{String(item.descricao ?? item.nome ?? "—")}</td>
                  <td>{String(item.un ?? "—")}</td>
                  <td>{String(item.qtd ?? "—")}</td>
                  <td>{moeda(item.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return resumirValor(valor, chave);
  };

  const renderDetalhes = () => pedidoSelecionado ? (
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
                <div><dt>Etapa atual/final</dt><dd>{rotuloEtapa(pedidoSelecionado.current_stage)}</dd></div>
                <div><dt>Modelo resolvido</dt><dd>{pedidoSelecionado.resolved_model || "Não registrado"}</dd></div>
                <div><dt>Refaz pedido</dt><dd>{pedidoSelecionado.retry_of || "Solicitação original"}</dd></div>
                <div><dt>Documento enviado</dt><dd>{pedidoSelecionado.result?.filename || "—"}</dd></div>
              </dl>

              {pedidoSelecionado.last_error && (
                <div className="admin-detail-section">
                  <h4>Último erro</h4>
                  <button type="button" className="admin-copy-button" onClick={() => void navigator.clipboard.writeText(pedidoSelecionado.last_error || "").then(() => setAviso("Último erro copiado.")).catch(() => setErro("Não foi possível copiar o erro."))}>Copiar erro completo</button>
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
              {historicoEtapas.length > 0 && (
                <div className="admin-detail-section">
                  <h4>Histórico das etapas</h4>
                  <div className="admin-history-list">
                    {historicoEtapas.map((etapa, indice) => (
                      <div className="admin-history-row" key={String(etapa.stage) + "-" + indice}>
                        <div>
                          <strong>{rotuloEtapa(String(etapa.stage || "Etapa"))}</strong>
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
                    {Object.entries(pedidoSelecionado.dados_usuario).filter(([chave]) => !chaveInterna(chave)).map(([chave, valor]) => (
                      <div key={chave} className={chave.replace(/[{}]/g, "").toUpperCase() === "ITENS" ? "admin-user-data-items" : undefined}>
                        <dt>{formatarNomeCampo(chave)}</dt>
                        <dd>{renderValorFormulario(chave, valor)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </section>
  ) : null;

  useEffect(() => {
    if (!pedidoSelecionado?.job_id) return;
    document.getElementById("admin-job-" + pedidoSelecionado.job_id)?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [pedidoSelecionado?.job_id]);

  return (
    <div
      className="admin-pedidos-overlay"
      role="presentation"
      onMouseDown={(evento) => { if (evento.target === evento.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="admin-pedidos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-pedidos-title"
        aria-describedby="admin-pedidos-description"
      >
        <header className="admin-pedidos-header">
          <div>
            <span className="prompt-eyebrow">ÁREA RESTRITA</span>
            <h2 id="admin-pedidos-title">Pedidos do LICITA.AI</h2>
            <p id="admin-pedidos-description">Histórico de solicitações, processamento e envio por e-mail.</p>
            {token && expiraEm !== null && <p className="admin-session-expiry">Sessão expira em {Math.max(0, Math.ceil((expiraEm - Date.now()) / 60_000))} min.</p>}
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
                  <option value="cancelled">Cancelados</option>
                </select>
                <button type="button" className="button button-secondary" onClick={() => void carregarPedidos(token)} disabled={carregando}>
                  {carregando ? "Atualizando…" : "Atualizar"}
                </button>
                <button type="button" className="button button-quiet" onClick={encerrarSessao}>Sair</button>
              </div>
            </div>

            <div className="admin-body">
            {erro && <p className="admin-feedback admin-feedback-error" role="alert">{erro}</p>}
            {aviso && <p className="admin-feedback admin-feedback-success" role="status">{aviso}</p>}

            <div className="admin-list-summary">
              <span>{total} {total === 1 ? "pedido encontrado" : "pedidos encontrados"}</span>
              <span>{atualizadoEm ? "Atualizado às " + new Date(atualizadoEm).toLocaleTimeString("pt-BR") : "Até 300 registros por consulta"} · horários no fuso local do navegador</span>
            </div>

            {carregando && itens.length === 0 ? (
              <MensagemEstado texto="Carregando solicitações…" />
            ) : itens.length === 0 ? (
              <MensagemEstado texto="Nenhum pedido encontrado para este filtro." />
            ) : (
              <div className="admin-jobs-list">
                {itens.map((pedido) => (
                  <article className="admin-job-card" id={"admin-job-" + pedido.job_id} key={pedido.job_id}>
                    <div className="admin-job-card-main">
                      <div className="admin-job-heading">
                        <span className={"admin-status-pill admin-status-" + pedido.status}>{rotuloStatus(pedido.status)}</span>
                        <span className="admin-job-id" title={pedido.job_id}>{pedido.job_id.slice(0, 8)}</span>
                        <button type="button" className="admin-copy-button" title="Copiar ID completo" aria-label={"Copiar ID completo " + pedido.job_id} onClick={() => void navigator.clipboard.writeText(pedido.job_id).then(() => setAviso("ID completo copiado.")).catch(() => setErro("Não foi possível copiar o ID."))}>Copiar ID</button>
                        {pedido.cancel_requested && <span className="admin-status-pill admin-status-cancelling">Cancelamento solicitado</span>}
                      </div>
                      <h3>{pedido.objeto || "Objeto não informado"}</h3>
                      <p className="admin-job-email">{pedido.email || "Destinatário não registrado"}</p>
                      <div className="admin-job-meta">
                        <span><strong>Solicitado:</strong> {formatarData(pedido.created_at)}</span>
                        <span><strong>Tempo total:</strong> {formatarDuracao(pedido.elapsed_seconds)}</span>
                        <span><strong>Processamento:</strong> {formatarDuracao(pedido.processing_seconds)}</span>
                        <span><strong>Etapa:</strong> {rotuloEtapa(pedido.current_stage)}</span>
                        <span><strong>Tentativas:</strong> {pedido.attempts}{pedido.max_attempts ? " de " + pedido.max_attempts : ""}</span>
                      </div>
                      {pedido.status === "queued" && pedido.retry_at && (
                        <p className="admin-job-retry-info">Nova tentativa às {new Date(pedido.retry_at).toLocaleTimeString("pt-BR")} (tentativa {Math.max(1, Number(pedido.attempts || 0) + 1)} de {pedido.max_attempts || "?"}).</p>
                      )}
                      {pedido.last_error && (
                        <div className="admin-job-error-wrap">
                          <p className="admin-job-error-preview">{pedido.last_error}</p>
                          <button type="button" className="admin-copy-button" onClick={() => void navigator.clipboard.writeText(pedido.last_error || "").then(() => setAviso("Último erro copiado.")).catch(() => setErro("Não foi possível copiar o erro."))}>Copiar erro</button>
                        </div>
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
                      {["failed", "cancelled"].includes(pedido.status) && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => setConfirmacao(confirmacao?.id === pedido.job_id && confirmacao.tipo === "refazer" ? null : { tipo: "refazer", id: pedido.job_id })}
                          disabled={refazendo === pedido.job_id}
                        >
                          Refazer
                        </button>
                      )}
                      {["queued", "processing"].includes(pedido.status) && !pedido.cancel_requested && (
                        <button
                          type="button"
                          className="button button-danger-outline"
                          onClick={() => setConfirmacao(confirmacao?.id === pedido.job_id && confirmacao.tipo === "cancelar" ? null : { tipo: "cancelar", id: pedido.job_id })}
                          disabled={confirmando === pedido.job_id}
                        >
                          Cancelar pedido
                        </button>
                      )}
                    </div>
                    {confirmacao?.id === pedido.job_id && (
                      <div className="admin-retry-confirm">
                        <p>{confirmacao.tipo === "cancelar"
                          ? pedido.status === "processing"
                            ? "A IA não pode ser interrompida no meio de uma etapa. O cancelamento vale ao fim da etapa atual e nenhum e-mail será enviado."
                            : "O pedido será removido da fila e nenhum e-mail será enviado."
                          : <>Será criada uma nova execução para <strong>{pedido.email}</strong>. O histórico original será mantido. Se um e-mail já tiver sido entregue antes de uma falha de comunicação, poderá ocorrer reenvio duplicado.</>}</p>
                        <div>
                          <button type="button" className="button button-quiet" onClick={() => setConfirmacao(null)}>Voltar</button>
                          <button type="button" className={confirmacao.tipo === "cancelar" ? "button button-danger-outline" : "button button-primary"} onClick={() => confirmacao.tipo === "cancelar" ? void cancelar(pedido) : void refazer(pedido)} disabled={refazendo === pedido.job_id || confirmando === pedido.job_id}>
                            {confirmacao.tipo === "cancelar" ? (confirmando === pedido.job_id ? "Cancelando…" : "Confirmar cancelamento") : (refazendo === pedido.job_id ? "Enfileirando…" : "Confirmar e refazer")}
                          </button>
                        </div>
                      </div>
                    )}
                    {pedidoSelecionado?.job_id === pedido.job_id && renderDetalhes()}
                  </article>
                ))}
              </div>
            )}


            </div>
          </>
        )}
      </section>
    </div>
  );
}
