import React, { useContext, useEffect, useRef, useState } from "react";
import { useToast } from "../components/toast";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import Step4 from "./steps/step4";
import Step5 from "./steps/step5";
import PromptModal from "../components/promptModal";
import AdminPedidosModal from "../components/AdminPedidosModal";
import { ThemeContext } from "../context/ThemeContext";
import { cancelarFilaFasePreparatoria, consultarFilaFasePreparatoria, gerarFasePreparatoria, type DocumentosReferenciaUpload, type FasePreparatoriaJob } from "../api";
import { criarDadosTeste, TipoTesteContratacao } from "../utils/dadosTeste";

const etapas = [
  { titulo: "Objeto e itens", descricao: "Informe o objeto da contratação, a justificativa da demanda e os itens." },
  { titulo: "Execução", descricao: "Defina as condições de execução, os prazos e os requisitos de qualidade." },
  { titulo: "Unidades", descricao: "Selecione as unidades demandantes e cadastre seus contatos." },
  { titulo: "Responsáveis", descricao: "Informe os gestores e fiscais do contrato." },
  { titulo: "Configurações finais", descricao: "Revise as regras da contratação, o pagamento e a dotação orçamentária." },
];

function etapaValida(indice: number, dados: any): boolean {
  switch (indice) {
    case 0:
      return Boolean(String(dados.objeto || "").trim() && String(dados.necessidade || "").trim() &&
        Array.isArray(dados.itens) && dados.itens.length > 0 &&
        dados.itens.every((item: any) => String(item?.descricao || "").trim() && Number(item.qtd) > 0 && Number(item.valor) > 0 && String(item.un || "").trim()));
    case 1:
      return Boolean(String(dados.execucao || "").trim());
    case 2:
      return Array.isArray(dados.secretarias) && dados.secretarias.length > 0 &&
        dados.secretarias.every((secretaria: string) => Array.isArray(dados.contatosSecretarias?.[secretaria]) && dados.contatosSecretarias[secretaria].length > 0);
    case 3:
      return Array.isArray(dados.gestores) && dados.gestores.length > 0 &&
        Array.isArray(dados.fiscais) && dados.fiscais.length > 0;
    case 4: {
      const criterioValido = dados.criterio === "ITEM" || (["GLOBAL", "LOTE"].includes(dados.criterio) && String(dados.motivoCriterio || "").trim());
      const modalidadeValida = dados.modalidade === "PREGAO_ELETRONICO" || String(dados.motivoModalidade || "").trim();
      const pacValido = dados.pac === "SIM" || String(dados.motivoPac || "").trim();
      const blocos = Array.isArray(dados.dotacaoBlocos) ? dados.dotacaoBlocos : [];
      const dotacaoValida = Boolean(String(dados.dotacao || "").trim() || dados.caminhoImagemDotacao ||
        blocos.some((bloco: any) => (bloco?.tipo === "imagem" && bloco.imagemBase64) || (bloco?.tipo === "texto" && String(bloco.texto || "").trim())));
      const pagamentoValido = dados.pagamentoTipo !== "POR_ETAPAS" || String(dados.pagamentoEtapas || "").trim();
      const prazoValido = Number(dados.prazoRefazimentoDias) >= 1;
      const unidade = String(dados.vigenciaUnidade || "Meses").toLocaleLowerCase("pt-BR");
      const fatorDias = unidade.startsWith("ano") ? 365 : unidade.startsWith("sem") ? 7 : unidade.startsWith("dia") ? 1 : 30;
      const vigenciaDias = Number(dados.vigenciaNum || 0) * fatorDias;
      const vigenciaValida = vigenciaDias > 0 && vigenciaDias <= 365;
      return Boolean(dados.instrumento && criterioValido && modalidadeValida && pacValido && dotacaoValida && pagamentoValido && prazoValido && vigenciaValida);
    }
    default:
      return false;
  }
}

export default function Wizard() {
  const [etapaAtual, setEtapaAtual] = useState(0);
  const [maiorEtapaAlcancada, setMaiorEtapaAlcancada] = useState(0);
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [dados, setDados] = useState<any>({
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
  const [jobAgendado, setJobAgendado] = useState<FasePreparatoriaJob | null>(null);
  const [jobDetalhe, setJobDetalhe] = useState<any>(null);
  const [cancelandoJob, setCancelandoJob] = useState(false);
  const [erroConsultaJob, setErroConsultaJob] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [emailEnvio, setEmailEnvio] = useState("");
  const [instrucoesEnvio, setInstrucoesEnvio] = useState("");
  const [arquivosEnvio, setArquivosEnvio] = useState<DocumentosReferenciaUpload>({});
  const [adminSessao, setAdminSessao] = useState<{ token: string; expiraEm: number } | null>(null);
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState(false);
  const [rascunhoInicializado, setRascunhoInicializado] = useState(false);
  const [mostrarTestes, setMostrarTestes] = useState(false);
  const [mostrarPromptModal, setMostrarPromptModal] = useState(false);
  const [mostrarAdminPedidos, setMostrarAdminPedidos] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const { showToast } = useToast();
  const dadosPreenchidos = Boolean(
    String(dados.objeto || "").trim() || String(dados.necessidade || "").trim() ||
    (Array.isArray(dados.itens) && dados.itens.length > 0) || String(dados.execucao || "").trim() ||
    (Array.isArray(dados.secretarias) && dados.secretarias.length > 0) ||
    (Array.isArray(dados.gestores) && dados.gestores.length > 0) ||
    (Array.isArray(dados.fiscais) && dados.fiscais.length > 0)
  );
  const validas = etapas.map((_, indice) => etapaValida(indice, dados));
  const habilitarDadosTeste = import.meta.env.VITE_ENABLE_TEST_DATA === "true";

  const atualizarDados = (novosDados: Partial<any> | ((atual: any) => Partial<any>)) => setDados((prev: any) => ({ ...prev, ...(typeof novosDados === "function" ? novosDados(prev) : novosDados) }));

  const carregarTeste = (tipo: TipoTesteContratacao) => {
    setDados(criarDadosTeste(tipo) as any);
    localStorage.removeItem("licita-ai-rascunho-v1");
    setRascunhoDisponivel(false);
    setEtapaAtual(0);
    setMaiorEtapaAlcancada(0);
    setMostrarTestes(false);
    setMostrarPromptModal(false);
    setCarregando(false);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setJobAgendado(null);
    setStatusTexto("Teste carregado. Revise as cinco etapas antes de confeccionar.");
  };

  useEffect(() => {
    const titulo = document.getElementById("wizard-step-title");
    titulo?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    titulo?.focus({ preventScroll: true });
  }, [etapaAtual]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem("licita-ai-rascunho-v1");
      if (salvo) {
        const parseado = JSON.parse(salvo);
        if (parseado?.versao === 1 && parseado?.dados && typeof parseado.dados === "object") setRascunhoDisponivel(true);
        else localStorage.removeItem("licita-ai-rascunho-v1");
      }
    } catch {
      localStorage.removeItem("licita-ai-rascunho-v1");
    } finally {
      setRascunhoInicializado(true);
    }
    if (window.location.hash === "#/admin" || new URLSearchParams(window.location.search).has("admin")) setMostrarAdminPedidos(true);
  }, []);

  useEffect(() => {
    if (!rascunhoInicializado || rascunhoDisponivel) return;
    try {
      const dadosSemImagem = {
        ...dados,
        caminhoImagemDotacao: "",
        dotacaoBlocos: (Array.isArray(dados.dotacaoBlocos) ? dados.dotacaoBlocos : [])
          .filter((bloco: any) => bloco?.tipo !== "imagem")
          .map((bloco: any) => ({ tipo: "texto", texto: String(bloco.texto || "") })),
      };
      const conteudo = JSON.stringify({ versao: 1, dados: dadosSemImagem, etapaAtual: Math.min(4, etapaAtual), salvoEm: new Date().toISOString() });
      if (conteudo.length <= 180_000) localStorage.setItem("licita-ai-rascunho-v1", conteudo);
    } catch {
      // O formulário continua utilizável mesmo se o navegador bloquear o armazenamento local.
    }
  }, [dados, etapaAtual, rascunhoInicializado, rascunhoDisponivel]);

  useEffect(() => {
    if (!dadosPreenchidos || geracaoSucesso) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [dadosPreenchidos, geracaoSucesso]);

  useEffect(() => {
    if (!geracaoSucesso || !jobAgendado) return;
    let ativo = true;
    let temporizador: number | undefined;
    const consultar = async () => {
      if (!ativo) return;
      if (document.visibilityState === "visible") {
        try {
          const status = await consultarFilaFasePreparatoria(jobAgendado.job_id, jobAgendado.status_token);
          if (!ativo) return;
          setJobDetalhe(status);
          setErroConsultaJob(null);
          setUltimaAtualizacao(new Date().toISOString());
          if (status.status === "sent") setStatusTexto("Documentos gerados e enviados por e-mail.");
          else if (status.status === "failed") setStatusTexto("O processamento falhou. Consulte o último erro abaixo.");
          else if (status.status === "cancelled") setStatusTexto("Solicitação cancelada; nenhum novo envio será iniciado.");
          else setStatusTexto(status.cancel_requested ? "Cancelamento solicitado; aguardando o fim da etapa atual." : "A solicitação continua em processamento na fila.");
        } catch (falha: any) {
          if (ativo) setErroConsultaJob(falha?.message || "Não foi possível atualizar o status agora.");
        }
      }
      if (ativo) temporizador = window.setTimeout(consultar, 10_000);
    };
    void consultar();
    return () => { ativo = false; if (temporizador !== undefined) window.clearTimeout(temporizador); };
  }, [geracaoSucesso, jobAgendado?.job_id, jobAgendado?.status_token]);

  const restaurarRascunho = () => {
    try {
      const salvo = localStorage.getItem("licita-ai-rascunho-v1");
      const parseado = salvo ? JSON.parse(salvo) : null;
      if (parseado?.versao === 1 && parseado?.dados) {
        setDados(parseado.dados);
        setEtapaAtual(Number.isInteger(parseado.etapaAtual) ? Math.max(0, Math.min(4, parseado.etapaAtual)) : 0);
        setMaiorEtapaAlcancada(Number.isInteger(parseado.etapaAtual) ? Math.max(0, Math.min(4, parseado.etapaAtual)) : 0);
      }
    } catch {
      showToast("Não foi possível restaurar o rascunho salvo.", "error");
    }
    setRascunhoDisponivel(false);
    showToast("Rascunho restaurado. Imagens de dotação precisam ser anexadas novamente.", "info");
  };

  const descartarRascunho = () => {
    localStorage.removeItem("licita-ai-rascunho-v1");
    setRascunhoDisponivel(false);
  };

  const irParaEtapa = (alvo: number) => {
    if (alvo <= etapaAtual) {
      setEtapaAtual(alvo);
      return;
    }
    const primeiraInvalida = validas.slice(0, alvo).findIndex((valida) => !valida);
    if (primeiraInvalida >= 0) {
      setTentouAvancar(true);
      showToast("Conclua a etapa " + (primeiraInvalida + 1) + " antes de avançar.", "info");
      setEtapaAtual(primeiraInvalida);
      setTimeout(() => {
        const invalido = document.querySelector<HTMLElement>("[aria-invalid='true']");
        (invalido || document.querySelector<HTMLElement>(".wizard-form-content input, .wizard-form-content textarea, .wizard-form-content select"))?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    setEtapaAtual(alvo);
    setMaiorEtapaAlcancada((atual) => Math.max(atual, alvo));
  };

  const validarEtapa = () => etapaValida(etapaAtual, dados);

  const avancar = () => {
    setTentouAvancar(true);
    if (!validas[etapaAtual]) {
      showToast("Complete os campos obrigatórios desta etapa antes de continuar.", "info");
      return;
    }
    if (etapaAtual < 4) {
      setEtapaAtual(etapaAtual + 1);
      setMaiorEtapaAlcancada((atual) => Math.max(atual, etapaAtual + 1));
      return;
    }
    const primeiraInvalida = validas.findIndex((valida) => !valida);
    if (primeiraInvalida >= 0) {
      showToast("Conclua a etapa " + (primeiraInvalida + 1) + " antes de confeccionar os documentos.", "info");
      setEtapaAtual(primeiraInvalida);
      return;
    }
    setMostrarPromptModal(true);
  };

  const voltar = () => {
    if (etapaAtual > 0) {
      setEtapaAtual(etapaAtual - 1);
      return;
    }
    if (dadosPreenchidos && !window.confirm("Há dados preenchidos. Sair desta página? O rascunho será salvo sem as imagens de dotação.")) return;
    window.location.href = "/";
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
      <main className="status-page">
        <div className="status-brand">LICITA.AI</div>
        {carregando && !erroMsg && !geracaoSucesso && (
          <section className="status-content" aria-live="polite">
            <span className="status-spinner" aria-hidden="true" />
            <h1>Registrando solicitação</h1>
            <p>{statusTexto}</p>
          </section>
        )}
        {erroMsg && (
          <section className="status-content status-content-error" role="alert">
            <h1>Não foi possível agendar</h1>
            <p>Confira o erro abaixo e tente novamente. Seus dados preenchidos continuam disponíveis.</p>
            <pre className="status-error-detail">{erroMsg}</pre>
            <button className="button button-primary" onClick={() => { setErroMsg(null); setCarregando(false); }}>
              Voltar e tentar novamente
            </button>
          </section>
        )}
        {geracaoSucesso && !erroMsg && (
          <section className="status-content" aria-live="polite">
            <h1>Solicitação colocada na fila</h1>
            <p>Os documentos serão gerados em segundo plano e enviados em um arquivo ZIP para o e-mail informado.</p>
            {jobAgendado && (
              <dl className="job-details">
                <div><dt>E-mail</dt><dd>{jobAgendado.email}</dd></div>
                {typeof jobAgendado.fila_posicao === "number" && <div><dt>Posição aproximada</dt><dd>{jobAgendado.fila_posicao}º</dd></div>}
                <div><dt>ID da solicitação</dt><dd><code>{jobAgendado.job_id}</code></dd></div>
              </dl>
            )}
            <button className="button button-primary" onClick={() => { setGeracaoSucesso(false); setJobAgendado(null); setStatusTexto("Iniciando..."); }}>
              Concluir
            </button>
          </section>
        )}
      </main>
    );
  }

  const podeAvancar = validarEtapa();
  const etapa = etapas[etapaAtual];

  return (
    <div className="wizard-app">
      <header className="wizard-header">
        <a className="wizard-brand" href="/" aria-label="LICITA.AI — página inicial">LICITA<span>.</span>AI</a>
        <div className="wizard-header-actions">
          <div className="test-menu-wrap">
            <button
              type="button"
              className="button button-quiet test-menu-trigger"
              onClick={() => setMostrarTestes(v => !v)}
              aria-expanded={mostrarTestes}
              aria-haspopup="menu"
            >
              Dados de teste <span aria-hidden="true">⌄</span>
            </button>
            {mostrarTestes && (
              <div className="test-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => carregarTeste("normal")}>Carregar contratação normal</button>
                <button type="button" role="menuitem" onClick={() => carregarTeste("direta")}>Carregar contratação direta</button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="button button-quiet admin-pedidos-trigger"
            onClick={() => setMostrarAdminPedidos(true)}
            aria-label="Abrir painel administrativo de pedidos"
          >Pedidos <span aria-hidden="true">↗</span></button>
          <button
            type="button"
            className="button button-quiet theme-toggle"
            onClick={toggleTheme}
            title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
          >{isDark ? "Claro" : "Escuro"}</button>
        </div>
      </header>

      <main className="wizard-main">
        <nav className="wizard-stepper" aria-label="Etapas da contratação">
          <ol>
            {etapas.map((item, index) => (
              <li
                key={item.titulo}
                className={index === etapaAtual ? "current" : index < etapaAtual ? "completed" : ""}
                aria-current={index === etapaAtual ? "step" : undefined}
              >
                <span className="stepper-number">{index < etapaAtual ? "✓" : index + 1}</span>
                <span className="stepper-label">{item.titulo}</span>
              </li>
            ))}
          </ol>
        </nav>

        <section className="wizard-section" aria-labelledby="wizard-step-title">
          <div className="wizard-heading">
            <span className="wizard-step-count">Etapa {etapaAtual + 1} de {etapas.length}</span>
            <h1 id="wizard-step-title">{etapa.titulo}</h1>
            <p>{etapa.descricao}</p>
          </div>

          <div ref={scrollRef} className="wizard-form-content">
            {renderizarEtapa()}
          </div>

          <footer className="wizard-navigation">
            <button type="button" className="button button-secondary" onClick={voltar}>
              {etapaAtual === 0 ? "Sair" : "Voltar"}
            </button>
            <button type="button" className="button button-primary" onClick={avancar} disabled={!podeAvancar}>
              {etapaAtual === 4 ? "Confeccionar documentos" : "Próxima etapa"}
              {etapaAtual !== 4 && <span aria-hidden="true">→</span>}
            </button>
          </footer>
        </section>
      </main>

      <PromptModal isOpen={mostrarPromptModal} onClose={() => setMostrarPromptModal(false)} onConfirm={confeccionarDocumentos} />
      {mostrarAdminPedidos && <AdminPedidosModal onClose={() => setMostrarAdminPedidos(false)} />}
    </div>
  );
}
