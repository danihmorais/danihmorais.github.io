import React, { useContext, useEffect, useRef, useState } from "react";
import { useToast } from "../components/toast";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import Step4 from "./steps/step4";
import Step5 from "./steps/step5";
import PromptModal from "../components/promptModal";
import ConfirmDialog from "../components/ConfirmDialog";
import AdminPedidosModal from "../components/AdminPedidosModal";
import { ThemeContext } from "../context/ThemeContext";
import { cancelarFilaFasePreparatoria, consultarFilaFasePreparatoria, gerarFasePreparatoria, type DocumentosReferenciaUpload, type FasePreparatoriaJob } from "../api";
import { criarDadosTeste, TipoTesteContratacao } from "../utils/dadosTeste";
import { obterLotes, distribuicaoLotesValida } from "../utils/lotes";

function rotuloEtapa(chave?: string): string {
  const nomes: Record<string, string> = {
    AGUARDANDO_FILA: "Aguardando na fila",
    AUDITORIA_MARCAS: "Auditoria de marcas",
    PAGAMENTO_ETAPAS: "Revisão das condições de pagamento",
    DFD: "Geração do DFD",
    ETP: "Geração do ETP",
    TR: "Geração do TR",
    CONTRATACAO_DIRETA: "Geração da contratação direta",
    GERACAO_DOCUMENTOS: "Montagem dos documentos",
    ENVIO_EMAIL: "Envio por e-mail",
    FASE_PREPARATORIA: "Geração dos documentos",
  };
  return nomes[String(chave || "").toUpperCase()] || String(chave || "Aguardando atualização").replace(/_/g, " ").toLocaleLowerCase("pt-BR");
}

function rotuloStatusPedido(status?: string, cancelRequested = false): string {
  if (cancelRequested && status !== "cancelled") return "Cancelamento solicitado";
  const nomes: Record<string, string> = {
    queued: "Na fila",
    processing: "Processando",
    sent: "Concluído",
    completed: "Concluído",
    failed: "Falha",
    cancelled: "Cancelado",
    cancelling: "Cancelando",
    retrying: "Nova tentativa agendada",
    unavailable: "Registro indisponível",
  };
  return nomes[String(status || "").toLowerCase()] || "Status desconhecido";
}

function pendenciasEtapa(indice: number, dados: any): string[] {
  switch (indice) {
    case 0: {
      const faltas: string[] = [];
      if (!String(dados.objeto || "").trim()) faltas.push("objeto da contratação");
      if (!String(dados.necessidade || "").trim()) faltas.push("justificativa da demanda");
      if (!Array.isArray(dados.itens) || !dados.itens.length) faltas.push("ao menos um item");
      else if (dados.itens.some((item: any) => !String(item?.descricao || "").trim() || !String(item?.un || "").trim() || !(Number(item.qtd) > 0) || !(Number(item.valor) > 0))) faltas.push("descrição, unidade, quantidade e valor positivo de todos os itens");
      if (obterLotes(dados).length > 0 && !distribuicaoLotesValida(dados)) {
        faltas.push("atribua todos os itens aos lotes e mantenha pelo menos um item em cada lote");
      }
      return faltas;
    }
    case 1: return String(dados.execucao || "").trim() ? [] : ["condições de execução"];
    case 2:
      return (Array.isArray(dados.secretarias) && dados.secretarias.length && dados.secretarias.every((secretaria: string) => Array.isArray(dados.contatosSecretarias?.[secretaria]) && dados.contatosSecretarias[secretaria].length))
        ? [] : ["ao menos uma unidade e seus contatos"];
    case 3: return (Array.isArray(dados.gestores) && dados.gestores.length && Array.isArray(dados.fiscais) && dados.fiscais.length) ? [] : ["gestores e fiscais"];
    case 4: return etapaValida(4, dados) ? [] : ["configurações obrigatórias, dotação, pagamento ou vigência de até 365 dias"];
    default: return ["campos obrigatórios"];
  }
}

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
        dados.itens.every((item: any) => String(item?.descricao || "").trim() && Number(item.qtd) > 0 && Number(item.valor) > 0 && String(item.un || "").trim()) &&
        (obterLotes(dados).length === 0 || distribuicaoLotesValida(dados)));
    case 1:
      return Boolean(String(dados.execucao || "").trim());
    case 2:
      return Array.isArray(dados.secretarias) && dados.secretarias.length > 0 &&
        dados.secretarias.every((secretaria: string) => Array.isArray(dados.contatosSecretarias?.[secretaria]) && dados.contatosSecretarias[secretaria].length > 0);
    case 3:
      return Array.isArray(dados.gestores) && dados.gestores.length > 0 &&
        Array.isArray(dados.fiscais) && dados.fiscais.length > 0;
    case 4: {
      const lotesConfigurados = obterLotes(dados);
      const criterioEfetivo = lotesConfigurados.length > 0 ? "LOTE" : dados.criterio;
      const criterioValido = criterioEfetivo === "ITEM" || (["GLOBAL", "LOTE"].includes(criterioEfetivo) && String(dados.motivoCriterio || "").trim());
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
    lotes: [],
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
  const [mostrarPromptModal, setMostrarPromptModal] = useState(false);
  const [mostrarAdminPedidos, setMostrarAdminPedidos] = useState(false);
  const [confirmacaoWizard, setConfirmacaoWizard] = useState<{ title: string; message: string; confirmLabel: string; cancelLabel?: string; variant?: "primary" | "danger"; onConfirm: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const beforeUnloadHandlerRef = useRef<((evento: BeforeUnloadEvent) => void) | null>(null);
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
  const statusPedido = jobDetalhe?.cancel_requested && jobDetalhe?.status !== "cancelled"
    ? "cancelling"
    : (jobDetalhe?.status || jobAgendado?.status || "queued");
  const cancelamentoSolicitado = Boolean(jobDetalhe?.cancel_requested || statusPedido === "cancelling");
  const pedidoAindaAtivo = ["queued", "processing", "cancelling"].includes(statusPedido);

  const atualizarDados = (novosDados: Partial<any> | ((atual: any) => Partial<any>)) => setDados((prev: any) => ({ ...prev, ...(typeof novosDados === "function" ? novosDados(prev) : novosDados) }));

  const carregarTeste = (tipo: TipoTesteContratacao) => {
    setDados(criarDadosTeste(tipo) as any);
    localStorage.removeItem("licita-ai-rascunho-v1");
    setRascunhoDisponivel(false);
    setEtapaAtual(0);
    setMaiorEtapaAlcancada(0);
    setTentouAvancar(false);
    setEmailEnvio("");
    setInstrucoesEnvio("");
    setArquivosEnvio({});
    setMostrarPromptModal(false);
    setCarregando(false);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setJobAgendado(null);
    setStatusTexto("Teste carregado. Revise as cinco etapas antes de confeccionar.");
  };

  const carregarTestePeloAdmin = (tipo: TipoTesteContratacao) => {
    const carregar = () => {
      carregarTeste(tipo);
      setMostrarAdminPedidos(false);
      showToast(tipo === "direta" ? "Dados de teste de contratação direta carregados." : "Dados de teste de contratação normal carregados.", "info");
    };
    if (!dadosPreenchidos) {
      carregar();
      return;
    }
    setConfirmacaoWizard({
      title: "Substituir os dados atuais?",
      message: "Carregar dados de teste substituirá o conteúdo preenchido no formulário.",
      confirmLabel: "Carregar dados de teste",
      cancelLabel: "Manter meus dados",
      variant: "danger",
      onConfirm: carregar,
    });
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
    if (new URLSearchParams(window.location.search).has("admin")) setMostrarAdminPedidos(true);
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
    beforeUnloadHandlerRef.current = avisar;
    window.addEventListener("beforeunload", avisar);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      if (beforeUnloadHandlerRef.current === avisar) beforeUnloadHandlerRef.current = null;
    };
  }, [dadosPreenchidos, geracaoSucesso]);

  useEffect(() => {
    if (!geracaoSucesso || !jobAgendado) return;
    if (["sent", "completed", "failed", "cancelled"].includes(String(jobAgendado.status || "").toLowerCase())) return;
    let ativo = true;
    let temporizador: number | undefined;
    const consultar = async () => {
      if (!ativo) return;
      let statusTerminal = false;
      if (document.visibilityState === "visible") {
        try {
          const status = await consultarFilaFasePreparatoria(jobAgendado.job_id, jobAgendado.status_token);
          if (!ativo) return;
          setJobDetalhe(status);
          setErroConsultaJob(null);
          setUltimaAtualizacao(new Date().toISOString());
          const statusNormalizado = String(status.status || "").toLowerCase();
          statusTerminal = ["sent", "completed", "failed", "cancelled"].includes(statusNormalizado);
          if (statusNormalizado === "sent" || statusNormalizado === "completed") setStatusTexto("Documentos gerados e enviados por e-mail.");
          else if (statusNormalizado === "failed") setStatusTexto("O processamento falhou. Consulte o último erro abaixo.");
          else if (statusNormalizado === "cancelled") setStatusTexto("Solicitação cancelada; nenhum novo envio será iniciado.");
          else setStatusTexto(status.cancel_requested ? "Cancelamento solicitado; aguardando o fim da etapa atual." : "A solicitação continua em processamento na fila.");
        } catch (falha: any) {
          if (ativo) setErroConsultaJob(falha?.message || "Não foi possível atualizar o status agora.");
        }
      }
      if (ativo && !statusTerminal) temporizador = window.setTimeout(consultar, 10_000);
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
    const sair = () => {
      const avisar = beforeUnloadHandlerRef.current;
      if (avisar) window.removeEventListener("beforeunload", avisar);
      beforeUnloadHandlerRef.current = null;
      window.location.href = "/";
    };
    if (dadosPreenchidos) {
      setConfirmacaoWizard({
        title: "Sair do formulário?",
        message: "Há dados preenchidos. O rascunho será salvo, mas não incluirá as imagens de dotação.",
        confirmLabel: "Sair",
        cancelLabel: "Continuar preenchendo",
        variant: "danger",
        onConfirm: sair,
      });
      return;
    }
    sair();
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
      setJobDetalhe({ status: resultado.status, fila_posicao: resultado.fila_posicao, current_stage: "AGUARDANDO_FILA", cancel_requested: false });
      setErroConsultaJob(null);
      setUltimaAtualizacao(new Date().toISOString());
      setStatusTexto("Solicitação registrada. A IA e o envio SMTP serão processados em segundo plano.");
      setGeracaoSucesso(true);
    } catch (erro: any) {
      console.error("Erro ao enfileirar geração:", erro);
      setErroMsg(erro?.message ? String(erro.message) : "Não foi possível colocar a solicitação na fila.");
      setMostrarPromptModal(false);
    } finally {
      setCarregando(false);
    }
  };

  const executarCancelamentoSolicitacao = async () => {
    if (!jobAgendado || !jobAgendado.status_token) return;
    setCancelandoJob(true);
    setErroConsultaJob(null);
    try {
      const resposta = await cancelarFilaFasePreparatoria(jobAgendado.job_id, jobAgendado.status_token);
      setJobDetalhe((atual: any) => ({ ...(atual || {}), status: resposta.status, cancel_requested: resposta.status === "cancelling" }));
      setStatusTexto(resposta.message);
      setUltimaAtualizacao(new Date().toISOString());
      showToast(resposta.message, "info");
    } catch (erro: any) {
      setErroConsultaJob(erro?.message || "Não foi possível cancelar a solicitação.");
    } finally {
      setCancelandoJob(false);
    }
  };

  const solicitarCancelamento = () => {
    if (!jobAgendado || !jobAgendado.status_token) return;
    const status = jobDetalhe?.status || jobAgendado.status;
    const emAndamento = status === "processing" || status === "cancelling";
    setConfirmacaoWizard({
      title: "Cancelar solicitação?",
      message: emAndamento
        ? "A IA não pode ser interrompida no meio de uma etapa. O cancelamento será aplicado ao final da etapa atual e nenhum e-mail será enviado."
        : "O pedido será removido da fila. Nenhum e-mail será enviado.",
      confirmLabel: "Cancelar solicitação",
      cancelLabel: "Continuar processamento",
      variant: "danger",
      onConfirm: () => { void executarCancelamentoSolicitacao(); },
    });
  };

  const voltarAoFormulario = () => {
    setGeracaoSucesso(false);
    setJobAgendado(null);
    setJobDetalhe(null);
    setErroConsultaJob(null);
    setCarregando(false);
    setErroMsg(null);
    setMostrarPromptModal(false);
  };

  const limparParaNovaSolicitacao = () => {
    localStorage.removeItem("licita-ai-rascunho-v1");
    setRascunhoDisponivel(false);
    setDados({
      objeto: "", necessidade: "", itens: [], amostra: false, vistoria: false, execucao: "",
      secretarias: [], contatosSecretarias: {}, gestores: [], fiscais: [], instrumento: "CONTRATO",
      prorrogar: true, meepp: "SIM", criterio: "ITEM", motivoCriterio: "", modalidade: "PREGAO_ELETRONICO",
      motivoModalidade: "", pac: "SIM", motivoPac: "", vigenciaNum: 1, vigenciaUnidade: "Meses",
      pagamentoTipo: "CONFORME_ENTREGAS", pagamentoEtapas: "", prazoRefazimentoDias: 5,
      dotacao: "", caminhoImagemDotacao: "", dotacaoBlocos: [],
    });
    setEtapaAtual(0);
    setMaiorEtapaAlcancada(0);
    setTentouAvancar(false);
    setEmailEnvio("");
    setInstrucoesEnvio("");
    setArquivosEnvio({});
    setJobAgendado(null);
    setJobDetalhe(null);
    setErroConsultaJob(null);
    setUltimaAtualizacao(null);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setMostrarPromptModal(false);
    showToast("Formulário limpo para uma nova solicitação.", "success");
  };

  const novaSolicitacao = () => {
    setConfirmacaoWizard({
      title: "Iniciar nova solicitação?",
      message: "Os dados atuais serão apagados para começar um formulário em branco.",
      confirmLabel: "Limpar e começar",
      cancelLabel: "Manter solicitação atual",
      variant: "danger",
      onConfirm: limparParaNovaSolicitacao,
    });
  };

  const renderizarEtapa = () => {
    switch (etapaAtual) {
      case 0: return <Step1 dados={dados} atualizarDados={atualizarDados} tentouAvancar={tentouAvancar} />;
      case 1: return <Step2 dados={dados} atualizarDados={atualizarDados} />;
      case 2: return <Step3 dados={dados} atualizarDados={atualizarDados} />;
      case 3: return <Step4 dados={dados} atualizarDados={atualizarDados} />;
      case 4: return <Step5 dados={dados} atualizarDados={atualizarDados} tentouAvancar={tentouAvancar} />;
      default: return null;
    }
  };

  if (carregando || erroMsg || geracaoSucesso) {
    const statusFinalFalha = statusPedido === "failed";
    const tituloStatus = erroMsg ? "Não foi possível agendar"
      : carregando ? "Registrando solicitação"
      : statusPedido === "sent" ? "Documentos enviados"
      : statusPedido === "failed" ? "Falha no processamento"
      : statusPedido === "cancelled" ? "Solicitação cancelada"
      : statusPedido === "cancelling" ? "Cancelamento solicitado"
      : "Solicitação colocada na fila";
    return (
      <main className="status-page">
        <div className="status-brand">LICITA.AI</div>
        {(carregando || (geracaoSucesso && pedidoAindaAtivo)) && !erroMsg && (
          <span className="status-spinner" aria-hidden="true" />
        )}
        <section className={"status-content" + (erroMsg || statusFinalFalha ? " status-content-error" : "")} aria-live="polite">
          <h1>{tituloStatus}</h1>
          <p>{erroMsg ? "Os dados do formulário, o e-mail, as instruções e os anexos foram preservados. Corrija o problema ou tente novamente." : statusTexto}</p>
          {erroMsg && <pre className="status-error-detail">{erroMsg}</pre>}
          {geracaoSucesso && !erroMsg && jobAgendado && (
            <>
              <p><strong>Status:</strong> {rotuloStatusPedido(statusPedido, cancelamentoSolicitado)}</p>
              <dl className="job-details">
                <div><dt>E-mail de destino</dt><dd>{jobAgendado.email}</dd></div>
                <div><dt>ID da solicitação</dt><dd><code>{jobAgendado.job_id}</code></dd></div>
                <div><dt>Etapa atual</dt><dd>{rotuloEtapa(jobDetalhe?.current_stage)}</dd></div>
                {(typeof (jobDetalhe?.fila_posicao ?? jobAgendado.fila_posicao) === "number" && pedidoAindaAtivo) && (
                  <div><dt>Posição aproximada</dt><dd>{jobDetalhe?.fila_posicao ?? jobAgendado.fila_posicao}º</dd></div>
                )}
                {jobDetalhe?.attempts !== undefined && <div><dt>Tentativas</dt><dd>{jobDetalhe.attempts}{jobDetalhe.max_attempts ? " de " + jobDetalhe.max_attempts : ""}</dd></div>}
                {jobDetalhe?.retry_at && <div><dt>Nova tentativa</dt><dd>{new Date(jobDetalhe.retry_at).toLocaleString("pt-BR")}</dd></div>}
                {ultimaAtualizacao && <div><dt>Atualizado às</dt><dd>{new Date(ultimaAtualizacao).toLocaleTimeString("pt-BR")}</dd></div>}
              </dl>
              <div className="status-actions">
                <button className="button button-secondary" onClick={() => void navigator.clipboard.writeText(jobAgendado.job_id).then(() => showToast("ID copiado.", "success")).catch(() => showToast("Não foi possível copiar o ID.", "error"))}>Copiar ID</button>
                {pedidoAindaAtivo && (
                  <button className="button button-secondary button-danger-outline" onClick={solicitarCancelamento} disabled={cancelandoJob || cancelamentoSolicitado}>
                    {cancelandoJob ? "Cancelando…" : cancelamentoSolicitado ? "Cancelamento solicitado" : "Cancelar solicitação"}
                  </button>
                )}
              </div>
              {jobDetalhe?.last_error && (statusFinalFalha || jobDetalhe.retry_at) && <pre className="status-error-detail">{String(jobDetalhe.last_error)}</pre>}
              {erroConsultaJob && <p role="status">{erroConsultaJob}</p>}
            </>
          )}
          <div className="status-actions">
            {erroMsg && <button className="button button-primary" onClick={() => { setErroMsg(null); setCarregando(false); setMostrarPromptModal(true); }}>Voltar e tentar novamente</button>}
            {geracaoSucesso && <button className="button button-secondary" onClick={voltarAoFormulario}>Voltar ao formulário</button>}
            {geracaoSucesso && <button className="button button-primary" onClick={novaSolicitacao}>Nova solicitação (limpar formulário)</button>}
          </div>
        </section>
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
          <button
            type="button"
            className="button button-secondary admin-pedidos-trigger"
            onClick={() => setMostrarAdminPedidos(true)}
          >Painel administrativo</button>
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
        {rascunhoDisponivel && (
          <div className="draft-banner" role="status">
            <p><strong>Há um rascunho salvo.</strong> Ele não inclui imagens de dotação; anexos precisam ser enviados novamente.</p>
            <div>
              <button type="button" className="button button-secondary" onClick={restaurarRascunho}>Retomar rascunho</button>
              <button type="button" className="button button-quiet" onClick={descartarRascunho}>Descartar</button>
            </div>
          </div>
        )}
        <nav className="wizard-stepper" aria-label="Etapas da contratação">
          <ol>
            {etapas.map((item, index) => {
              const bloqueada = index > etapaAtual && !validas.slice(0, index).every(Boolean);
              const pendente = index <= maiorEtapaAlcancada && !validas[index];
              const classe = index === etapaAtual ? "current" : validas[index] ? "completed" : bloqueada ? "locked" : pendente ? "needs-attention" : "";
              return (
                <li key={item.titulo} className={classe}>
                  <button
                    type="button"
                    className="stepper-button"
                    onClick={() => irParaEtapa(index)}
                    aria-current={index === etapaAtual ? "step" : undefined}
                    aria-disabled={bloqueada}
                    aria-label={`Etapa ${index + 1}: ${item.titulo}${validas[index] ? ", válida" : bloqueada ? ", bloqueada" : ", pendente"}`}
                    title={item.titulo}
                  >
                    <span className="stepper-number">{validas[index] && index !== etapaAtual ? "✓" : pendente ? "!" : index + 1}</span>
                    <span className="stepper-label">{item.titulo}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="wizard-section" aria-labelledby="wizard-step-title">
          <div className="wizard-heading">
            <span className="wizard-step-count">Etapa {etapaAtual + 1} de {etapas.length}</span>
            <h1 id="wizard-step-title" tabIndex={-1}>{etapa.titulo}</h1>
            <p>{etapa.descricao}</p>
          </div>

          <div ref={scrollRef} className="wizard-form-content">
            {renderizarEtapa()}
          </div>

          {tentouAvancar && !podeAvancar && (
            <p className="wizard-validation-hint" role="status">Faltam: {pendenciasEtapa(etapaAtual, dados).join("; ")}.</p>
          )}
          <footer className="wizard-navigation">
            <button type="button" className="button button-secondary" onClick={voltar}>
              {etapaAtual === 0 ? "Sair" : "Voltar"}
            </button>
            <button type="button" className="button button-primary" onClick={avancar} aria-disabled={!podeAvancar}>
              {etapaAtual === 4 ? "Confeccionar documentos" : "Próxima etapa"}
              {etapaAtual !== 4 && <span aria-hidden="true">→</span>}
            </button>
          </footer>
        </section>
      </main>

      <PromptModal
        isOpen={mostrarPromptModal}
        onClose={() => setMostrarPromptModal(false)}
        onConfirm={confeccionarDocumentos}
        texto={instrucoesEnvio}
        onTextoChange={setInstrucoesEnvio}
        email={emailEnvio}
        onEmailChange={setEmailEnvio}
        arquivos={arquivosEnvio}
        onArquivosChange={setArquivosEnvio}
      />
      {mostrarAdminPedidos && (
        <AdminPedidosModal
          onClose={() => setMostrarAdminPedidos(false)}
          sessaoInicial={adminSessao}
          onSessaoChange={setAdminSessao}
          onLoadTestData={carregarTestePeloAdmin}
        />
      )}
      {confirmacaoWizard && (
        <ConfirmDialog
          title={confirmacaoWizard.title}
          message={confirmacaoWizard.message}
          confirmLabel={confirmacaoWizard.confirmLabel}
          cancelLabel={confirmacaoWizard.cancelLabel}
          variant={confirmacaoWizard.variant}
          onCancel={() => setConfirmacaoWizard(null)}
          onDismiss={() => setConfirmacaoWizard(null)}
          onConfirm={() => {
            const confirmar = confirmacaoWizard.onConfirm;
            setConfirmacaoWizard(null);
            confirmar();
          }}
        />
      )}
    </div>
  );
}
