import React, { useContext, useEffect, useRef, useState } from "react";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import Step4 from "./steps/step4";
import Step5 from "./steps/step5";
import PromptModal from "../components/promptModal";
import { ThemeContext } from "../context/ThemeContext";
import { gerarFasePreparatoria, type DocumentosReferenciaUpload } from "../api";
import { criarDadosTeste, TipoTesteContratacao } from "../utils/dadosTeste";

const etapas = [
  { titulo: "Objeto e justificativa", navTitle: "Objeto e justificativa", descricao: "Defina o que será contratado, a necessidade pública e os itens que compõem a demanda.", apoio: "Identificação da necessidade" },
  { titulo: "Condições de execução", navTitle: "Condições de execução", descricao: "Registre os requisitos de entrega, execução e controle de qualidade.", apoio: "Requisitos da contratação" },
  { titulo: "Unidade demandante", navTitle: "Unidade demandante", descricao: "Selecione as unidades envolvidas e informe os contatos responsáveis por cada uma.", apoio: "Origem e comunicação da demanda" },
  { titulo: "Equipe de planejamento", navTitle: "Equipe de planejamento", descricao: "Identifique gestores e fiscais que participarão do acompanhamento contratual.", apoio: "Responsáveis pelo processo" },
  { titulo: "Definição do instrumento", navTitle: "Instrumento e regras", descricao: "Consolide as escolhas administrativas, as condições de pagamento e a dotação orçamentária.", apoio: "Parâmetros finais" },
];

export default function Wizard() {
  const [etapaAtual, setEtapaAtual] = useState(0);
  const [dados, setDados] = useState({
    objeto: "",
    necessidade: "",
    itens: [],
    amostra: false,
    vistoria: false,
    execucao: "",
    secretarias: [],
    contatosSecretarias: {} as Record<string, any[]>,
    gestores: [],
    fiscais: [],
    instrumento: "CONTRATO",
    prorrogar: true,
    meepp: "SIM",
    criterio: "ITEM",
    motivoCriterio: "",
    modalidade: "PREGAO_ELETRONICO",
    motivoModalidade: "",
    pac: "SIM",
    motivoPac: "",
    vigenciaNum: 1,
    vigenciaUnidade: "Meses",
    pagamentoTipo: "CONFORME_ENTREGAS",
    pagamentoEtapas: "",
    prazoRefazimentoDias: 5,
    dotacao: "",
    caminhoImagemDotacao: "",
    dotacaoBlocos: []
  });
  const [carregando, setCarregando] = useState(false);
  const [statusTexto, setStatusTexto] = useState("Iniciando...");
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [geracaoSucesso, setGeracaoSucesso] = useState(false);
  const [jobAgendado, setJobAgendado] = useState<{ job_id: string; status: string; email: string; message: string; fila_posicao?: number; solicitacoes_a_frente?: number } | null>(null);
  const [mostrarTestes, setMostrarTestes] = useState(false);
  const [mostrarPromptModal, setMostrarPromptModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const atualizarDados = (novosDados: Partial<typeof dados>) => setDados(prev => ({ ...prev, ...novosDados }));

  const carregarTeste = (tipo: TipoTesteContratacao) => {
    setDados(criarDadosTeste(tipo) as any);
    setEtapaAtual(0);
    setMostrarTestes(false);
    setMostrarPromptModal(false);
    setCarregando(false);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setJobAgendado(null);
    setStatusTexto("Teste carregado. Revise as cinco etapas antes de confeccionar.");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [etapaAtual]);

  const validarEtapa = () => {
    switch (etapaAtual) {
      case 0:
        return dados.objeto.trim() !== "" && dados.necessidade.trim() !== "" && dados.itens.length > 0 && dados.itens.every((i: any) => i.descricao.trim() !== "" && i.qtd > 0 && i.valor > 0 && i.un.trim() !== "");
      case 1:
        return dados.execucao.trim() !== "";
      case 2:
        return dados.secretarias.length > 0 && dados.secretarias.every((sec: string) => dados.contatosSecretarias[sec]?.length > 0);
      case 3:
        return dados.gestores.length > 0 && dados.fiscais.length > 0;
      case 4:
        const criterioValido = dados.criterio === "ITEM" || ((dados.criterio === "GLOBAL" || dados.criterio === "LOTE") && dados.motivoCriterio.trim() !== "");
        const modalidadeValida = dados.modalidade === "PREGAO_ELETRONICO" || dados.motivoModalidade.trim() !== "";
        const pacValido = dados.pac === "SIM" || dados.motivoPac.trim() !== "";
        const dotacaoBlocosValidos =
          Array.isArray(dados.dotacaoBlocos) &&
          dados.dotacaoBlocos.some(
            (bloco: any) =>
              (bloco?.tipo === "imagem" && !!bloco.imagemBase64) ||
              (bloco?.tipo === "texto" && String(bloco.texto || "").trim())
          );
        const dotacaoValida = dados.dotacao.trim() !== "" || !!dados.caminhoImagemDotacao || dotacaoBlocosValidos;
        const pagamentoValido = dados.pagamentoTipo !== "POR_ETAPAS" || String(dados.pagamentoEtapas || "").trim() !== "";
        const prazoRefazimentoValido = Number(dados.prazoRefazimentoDias) >= 1;
        return dados.instrumento !== "" && criterioValido && modalidadeValida && pacValido && dotacaoValida && pagamentoValido && prazoRefazimentoValido;
      default:
        return true;
    }
  };

  const avancar = () => {
    if (etapaAtual < 4) setEtapaAtual(etapaAtual + 1);
    else setMostrarPromptModal(true);
  };

  const voltar = () => {
    if (etapaAtual > 0) setEtapaAtual(etapaAtual - 1);
    else window.location.href = "/";
  };

  const confeccionarDocumentos = async ({ instrucoes, email, arquivos }: { instrucoes: string; email: string; arquivos: DocumentosReferenciaUpload }) => {
    setMostrarPromptModal(false);
    setCarregando(true);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setJobAgendado(null);
    const quantidadeArquivos = Object.values(arquivos || {}).filter((arquivo): arquivo is File => arquivo instanceof File).length;
    setStatusTexto(quantidadeArquivos > 0
      ? "Processando os documentos de referência e colocando a solicitação na fila..."
      : "Registrando a solicitação e colocando todo o processamento na fila...");

    try {
      const resultado = await gerarFasePreparatoria({
        email,
        instrucoes: instrucoes.trim(),
        dados_usuario: dados,
      }, arquivos);
      setJobAgendado(resultado);
      setStatusTexto("Solicitação registrada. A IA e o envio SMTP serão processados em segundo plano.");
      setGeracaoSucesso(true);
    } catch (erro: any) {
      console.error("Erro ao enfileirar geração:", erro);
      setErroMsg(erro?.message ? String(erro.message) : "Não foi possível colocar a solicitação na fila.");
    } finally {
      setCarregando(false);
    }
  };

  const renderizarEtapa = () => {
    switch (etapaAtual) {
      case 0: return <Step1 dados={dados} atualizarDados={atualizarDados} />;
      case 1: return <Step2 dados={dados} atualizarDados={atualizarDados} />;
      case 2: return <Step3 dados={dados} atualizarDados={atualizarDados} />;
      case 3: return <Step4 dados={dados} atualizarDados={atualizarDados} />;
      case 4: return <Step5 dados={dados} atualizarDados={atualizarDados} />;
      default: return null;
    }
  };

  if (carregando || erroMsg || geracaoSucesso) {
    return (
      <div className="state-page">
        <div className="state-card">
          <div className="state-brand">
            <span className="brand-mark brand-mark-small">LA</span>
            <span>LICITA.AI <small>FASE PREPARATÓRIA</small></span>
          </div>

          {carregando && !erroMsg && !geracaoSucesso && (
            <div className="state-content">
              <div className="state-icon state-icon-loading"><span className="loading-spinner" /></div>
              <span className="state-eyebrow">SOLICITAÇÃO EM ANDAMENTO</span>
              <h1>Preparando sua solicitação</h1>
              <p>{statusTexto}</p>
              <div className="state-progress"><span /></div>
              <p className="state-footnote">Mantenha esta janela aberta até a solicitação ser registrada.</p>
            </div>
          )}

          {erroMsg && (
            <div className="state-content">
              <div className="state-icon state-icon-error">!</div>
              <span className="state-eyebrow">NÃO FOI POSSÍVEL CONTINUAR</span>
              <h1>Não foi possível agendar</h1>
              <p>Confira os detalhes abaixo. Seus dados preenchidos continuam disponíveis nesta sessão.</p>
              <div className="state-error-detail">
                <pre>{erroMsg}</pre>
              </div>
              <button className="btn btn-primary state-action" onClick={() => { setErroMsg(null); setCarregando(false); }}>
                <span aria-hidden="true">←</span> Voltar e tentar novamente
              </button>
            </div>
          )}

          {geracaoSucesso && !erroMsg && (
            <div className="state-content">
              <div className="state-icon state-icon-success"><span>✓</span></div>
              <span className="state-eyebrow">SOLICITAÇÃO REGISTRADA</span>
              <h1>Você já pode seguir em frente</h1>
              <p>Os documentos serão gerados em segundo plano. Quando o processamento terminar, o arquivo ZIP será enviado automaticamente para o e-mail informado.</p>
              {jobAgendado && (
                <div className="job-summary">
                  <div className="job-summary-row"><span>E-mail para recebimento</span><strong>{jobAgendado.email}</strong></div>
                  {typeof jobAgendado.fila_posicao === "number" && <div className="job-summary-row"><span>Posição aproximada na fila</span><strong>{jobAgendado.fila_posicao}º</strong></div>}
                  <div className="job-summary-row job-id-row"><span>Identificador da solicitação</span><code>{jobAgendado.job_id}</code></div>
                </div>
              )}
              <button className="btn btn-success state-action" onClick={() => { setGeracaoSucesso(false); setJobAgendado(null); setStatusTexto("Iniciando..."); }}>
                Concluir <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
        <div className="state-footer">LICITA.AI <span>·</span> Apoio à fase preparatória das contratações públicas</div>
      </div>
    );
  }

  const podeAvancar = validarEtapa();
  const etapa = etapas[etapaAtual];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">LA</div>
          <div className="brand-copy">
            <span className="brand-name">LICITA<span className="brand-dot">.</span>AI</span>
            <span className="brand-caption">PLANEJAMENTO PÚBLICO</span>
          </div>
        </div>

        <div className="sidebar-workspace">
          <span className="workspace-icon" aria-hidden="true">▦</span>
          <div><span className="workspace-label">ESPAÇO DE TRABALHO</span><strong>Fase preparatória</strong></div>
        </div>

        <div className="sidebar-section-label">SEU PROCESSO</div>
        <nav className="step-nav" aria-label="Etapas do processo">
          {etapas.map((item, index) => (
            <div
              key={item.navTitle}
              className={"step-nav-item" + (etapaAtual === index ? " is-active" : "") + (etapaAtual > index ? " is-complete" : "")}
              aria-current={etapaAtual === index ? "step" : undefined}
            >
              <span className="step-nav-marker">{etapaAtual > index ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <span className="step-nav-copy">
                <strong>{item.navTitle}</strong>
                <small>{["Objeto e itens", "Requisitos e prazos", "Unidades e contatos", "Gestores e fiscais", "Regras e orçamento"][index]}</small>
              </span>
              {etapaAtual === index && <span className="step-nav-current" aria-hidden="true">›</span>}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip-icon" aria-hidden="true">✦</div>
          <div>
            <strong>Um passo de cada vez</strong>
            <p>Revise as informações antes de avançar. Os campos obrigatórios ajudam a manter os dados completos.</p>
          </div>
          <div className="sidebar-version"><span className="status-dot" /> Ambiente de trabalho</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-overline">FASE PREPARATÓRIA <span>/</span> NOVA SOLICITAÇÃO</span>
            <span className="topbar-title">Estruturação da contratação</span>
          </div>

          <div className="topbar-actions">
            <div className="test-menu-wrap">
              <button
                type="button"
                className={"btn btn-secondary test-menu-trigger" + (mostrarTestes ? " is-open" : "")}
                onClick={() => setMostrarTestes(v => !v)}
                aria-expanded={mostrarTestes}
                aria-haspopup="menu"
              >
                <span className="button-symbol" aria-hidden="true">⚗</span>
                <span>Dados de teste</span>
                <span className="chevron" aria-hidden="true">⌄</span>
              </button>
              {mostrarTestes && (
                <div className="test-menu" role="menu">
                  <div className="test-menu-heading">Preencher com exemplo</div>
                  <button type="button" role="menuitem" onClick={() => carregarTeste("normal")}><span className="test-option-icon">01</span><span><strong>Contratação normal</strong><small>Exemplo completo de processo</small></span></button>
                  <button type="button" role="menuitem" onClick={() => carregarTeste("direta")}><span className="test-option-icon">02</span><span><strong>Contratação direta</strong><small>Exemplo de contratação direta</small></span></button>
                </div>
              )}
            </div>
            <span className="topbar-separator" aria-hidden="true" />
            <button type="button" className="btn btn-theme" onClick={toggleTheme} title={isDark ? "Ativar tema claro" : "Ativar tema escuro"} aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}>
              <span aria-hidden="true">{isDark ? "☼" : "☾"}</span>
            </button>
          </div>
        </header>

        <main className="app-main">
          <div className="page-heading">
            <div className="page-heading-copy">
              <div className="step-kicker"><span>ETAPA {String(etapaAtual + 1).padStart(2, "0")}</span><span className="kicker-divider">/</span> {etapa.apoio}</div>
              <h1>{etapa.titulo}</h1>
              <p>{etapa.descricao}</p>
            </div>
            <div className="progress-summary">
              <div className="progress-label"><span>Progresso</span><strong>{Math.round(((etapaAtual + 1) / etapas.length) * 100)}%</strong></div>
              <div className="progress-track"><span style={{ width: ((etapaAtual + 1) / etapas.length) * 100 + "%" }} /></div>
              <div className="progress-caption">Etapa {etapaAtual + 1} de {etapas.length}</div>
            </div>
          </div>

          <div className="mobile-step-strip" aria-label={"Etapa " + (etapaAtual + 1) + " de " + etapas.length}>
            <span className="mobile-step-count">0{etapaAtual + 1}</span>
            <span className="mobile-step-name">{etapa.titulo}</span>
            <span className="mobile-step-total">de 05</span>
          </div>

          <section className="content-panel" aria-label={etapa.titulo}>
            <div className="panel-topline"><span className="panel-indicator" /><span>{etapa.apoio}</span><span className="panel-topline-spacer" /><span className="required-note"><i aria-hidden="true">*</i> Campos obrigatórios</span></div>
            <div ref={scrollRef} className="step-content">{renderizarEtapa()}</div>
          </section>

          <footer className="wizard-footer">
            <div className="footer-assurance"><span className="footer-check" aria-hidden="true">✓</span><span>Seus dados são mantidos durante o preenchimento desta solicitação.</span></div>
            <div className="footer-controls">
              <button type="button" className="btn btn-ghost" onClick={voltar}><span aria-hidden="true">←</span> Voltar</button>
              <button type="button" className={"btn btn-primary btn-next" + (etapaAtual === 4 ? " btn-finish" : "")} onClick={avancar} disabled={!podeAvancar}>
                {etapaAtual === 4 ? "Confeccionar documentos" : "Continuar"} <span aria-hidden="true">{etapaAtual === 4 ? "✓" : "→"}</span>
              </button>
            </div>
          </footer>
        </main>
      </div>

      <PromptModal isOpen={mostrarPromptModal} onClose={() => setMostrarPromptModal(false)} onConfirm={confeccionarDocumentos} />
    </div>
  );
}
