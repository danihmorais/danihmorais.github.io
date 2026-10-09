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
  { titulo: "Objeto e itens", descricao: "Informe o objeto da contratação, a justificativa da demanda e os itens." },
  { titulo: "Execução", descricao: "Defina as condições de execução, os prazos e os requisitos de qualidade." },
  { titulo: "Unidades", descricao: "Selecione as unidades demandantes e cadastre seus contatos." },
  { titulo: "Responsáveis", descricao: "Informe os gestores e fiscais do contrato." },
  { titulo: "Configurações finais", descricao: "Revise as regras da contratação, o pagamento e a dotação orçamentária." },
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
    </div>
  );
}
