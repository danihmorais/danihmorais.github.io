import React, { useContext, useEffect, useRef, useState } from "react";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import Step4 from "./steps/step4";
import Step5 from "./steps/step5";
import ConfigIA from "../components/configIA";
import PromptModal from "../components/promptModal";
import { ThemeContext } from "../context/ThemeContext";
import { gerarFasePreparatoria } from "../api";
import { criarDadosTeste, TipoTesteContratacao } from "../utils/dadosTeste";

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
    dotacao: "",
    caminhoImagemDotacao: ""
  });
  const [carregando, setCarregando] = useState(false);
  const [statusTexto, setStatusTexto] = useState("Iniciando...");
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [geracaoSucesso, setGeracaoSucesso] = useState(false);
  const [jobAgendado, setJobAgendado] = useState<{ job_id: string; status: string; email: string; message: string; fila_posicao?: number; solicitacoes_a_frente?: number } | null>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
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
    setMostrarConfig(false);
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
        const dotacaoValida = dados.dotacao.trim() !== "" || !!dados.caminhoImagemDotacao;
        return dados.instrumento !== "" && criterioValido && modalidadeValida && pacValido && dotacaoValida;
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

  const confeccionarDocumentos = async ({ instrucoes, email }: { instrucoes: string; email: string }) => {
    setMostrarPromptModal(false);
    setCarregando(true);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setJobAgendado(null);
    setStatusTexto("Registrando a solicitação e colocando todo o processamento na fila...");

    try {
      const resultado = await gerarFasePreparatoria({
        email,
        instrucoes: instrucoes.trim(),
        dados_usuario: dados,
      });
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--bg-base)", padding: "24px", boxSizing: "border-box" }}>
        <div style={{ background: "var(--bg-panel)", padding: "40px", borderRadius: "24px", boxShadow: "var(--shadow-lg)", textAlign: "center", width: "100%", maxWidth: "620px" }}>
          {carregando && !erroMsg && !geracaoSucesso && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⏳</div>
              <h2 style={{ margin: "0 0 16px", color: "var(--text-main)", fontSize: "22px" }}>Registrando solicitação</h2>
              <p style={{ color: "var(--text-muted)", margin: 0 }}>{statusTexto}</p>
            </>
          )}

          {erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚠️</div>
              <h2 style={{ margin: "0 0 16px", color: "var(--btn-danger)", fontSize: "22px" }}>Não foi possível agendar</h2>
              <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--btn-danger)", borderRadius: "10px", padding: "16px", marginBottom: "24px", textAlign: "left", maxHeight: "260px", overflowY: "auto" }}>
                <pre style={{ color: "var(--btn-danger)", fontSize: "13px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit" }}>{erroMsg}</pre>
              </div>
              <button onClick={() => { setErroMsg(null); setCarregando(false); }} style={{ padding: "12px 32px", background: "var(--btn-primary)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>← Voltar e tentar novamente</button>
            </>
          )}

          {geracaoSucesso && !erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>✅</div>
              <h2 style={{ margin: "0 0 16px", color: "var(--btn-success)", fontSize: "22px" }}>Solicitação colocada na fila!</h2>
              <p style={{ color: "var(--text-muted)", margin: "0 0 18px", fontSize: "14px" }}>
                Você não precisa permanecer nesta tela. A IA vai gerar os documentos em segundo plano e, quando terminar, o ZIP será enviado automaticamente para o e-mail informado.
              </p>
              {jobAgendado && (
                <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px", textAlign: "left", color: "var(--text-main)", fontSize: "13px" }}>
                  <div><strong>E-mail:</strong> {jobAgendado.email}</div>
                  {typeof jobAgendado.fila_posicao === "number" && <div style={{ marginTop: "6px" }}><strong>Posição aproximada:</strong> {jobAgendado.fila_posicao}º</div>}
                  <div style={{ marginTop: "6px", wordBreak: "break-all" }}><strong>ID:</strong> {jobAgendado.job_id}</div>
                </div>
              )}
              <button onClick={() => { setGeracaoSucesso(false); setJobAgendado(null); setStatusTexto("Iniciando..."); }} style={{ padding: "12px 32px", background: "var(--btn-success)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>✓ Concluir</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const podeAvancar = validarEtapa();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "var(--bg-base)", fontFamily: "sans-serif" }}>
      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", color: "var(--text-main)" }}>
            {etapaAtual === 0 && "Etapa 1: Objeto e Justificativa"}
            {etapaAtual === 1 && "Etapa 2: Condições de Execução"}
            {etapaAtual === 2 && "Etapa 3: Unidade Demandante"}
            {etapaAtual === 3 && "Etapa 4: Equipe de Planejamento"}
            {etapaAtual === 4 && "Etapa 5: Definição do Instrumento"}
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "14px" }}>Forneça os dados do processo com clareza para gerar os artefatos corretamente.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "var(--text-muted)", fontWeight: "bold", fontSize: "14px" }}>Passo {etapaAtual + 1} de 5</span>
          <div style={{ position: "relative" }}>
            <button onClick={() => setMostrarTestes(v => !v)} style={{ height: "44px", padding: "0 14px", borderRadius: "8px", border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg-panel)", color: "var(--text-main)", fontWeight: 600, boxShadow: "var(--shadow-sm)" }}>🧪 Testes</button>
            {mostrarTestes && (
              <div style={{ position: "absolute", top: "52px", right: 0, minWidth: "240px", padding: "8px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "var(--shadow-lg)", zIndex: 1100 }}>
                <button onClick={() => carregarTeste("normal")} style={{ width: "100%", padding: "11px 12px", textAlign: "left", border: "none", borderRadius: "8px", background: "transparent", color: "var(--text-main)", cursor: "pointer" }}>📋 Contratação normal</button>
                <button onClick={() => carregarTeste("direta")} style={{ width: "100%", padding: "11px 12px", textAlign: "left", border: "none", borderRadius: "8px", background: "transparent", color: "var(--text-main)", cursor: "pointer" }}>⚡ Contratação direta</button>
              </div>
            )}
          </div>
          <button onClick={() => setMostrarConfig(true)} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "8px", width: "44px", height: "44px", cursor: "pointer", boxShadow: "var(--shadow-sm)", fontSize: "20px" }} title="Configurações de IA">⚙️</button>
          <button onClick={toggleTheme} style={{ width: "44px", height: "44px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--bg-subtle)", color: "var(--text-main)" }}>{isDark ? "☀️" : "🌙"}</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "0 40px", overflow: "hidden" }}>
        <div style={{ height: "100%", background: "var(--bg-panel)", borderRadius: "24px", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", padding: "16px" }}>
          <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", padding: "16px" }}>{renderizarEtapa()}</div>
        </div>
      </div>

      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between" }}>
        <button onClick={voltar} style={{ width: "140px", height: "44px", borderRadius: "12px", border: "2px solid var(--border)", background: "transparent", color: "var(--text-main)", fontWeight: "bold", fontSize: "14px", opacity: etapaAtual === 0 ? 0.5 : 1 }}>Voltar</button>
        <button onClick={avancar} disabled={!podeAvancar} style={{ width: "140px", height: "44px", borderRadius: "12px", border: "none", background: !podeAvancar ? "var(--text-light)" : etapaAtual === 4 ? "var(--btn-success)" : "var(--btn-primary)", color: "#fff", fontWeight: "bold", fontSize: "14px", cursor: !podeAvancar ? "not-allowed" : "pointer" }}>{etapaAtual === 4 ? "Confeccionar" : "Avançar"}</button>
      </div>

      {mostrarConfig && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--bg-panel)", padding: "32px", borderRadius: "24px", width: "100%", maxWidth: "500px", position: "relative", boxShadow: "var(--shadow-lg)" }}>
            <button onClick={() => setMostrarConfig(false)} style={{ position: "absolute", top: "20px", right: "20px", background: "var(--bg-subtle)", border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", color: "var(--text-muted)", fontWeight: "bold" }}>✕</button>
            <h2 style={{ marginTop: 0, marginBottom: "24px", color: "var(--text-main)", textAlign: "center", fontSize: "20px" }}>⚙️ Configurações de IA</h2>
            <ConfigIA onSuccess={() => setMostrarConfig(false)} textoBotao="Salvar Alterações" />
          </div>
        </div>
      )}

      <PromptModal isOpen={mostrarPromptModal} onClose={() => setMostrarPromptModal(false)} onConfirm={confeccionarDocumentos} />
    </div>
  );
}
