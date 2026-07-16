import React, { useState, useEffect, useRef, useContext } from "react";

import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import { mapearDadosWizard } from "../utils/mapearDados";
import { ThemeContext } from "../context/ThemeContext";
import "./wizard.css";
import logo from "../assets/logo.png";
import { gerarEdital } from "../api";


export default function Wizard() {
  const [etapaAtual, setEtapaAtual] = useState(0);
  const [dados, setDados] = useState({
    numeroProcesso: "",
    numeroModalidade: "",
    modalidade: "PREGAO_ELETRONICO",
    criterios: "ITEM",
    tipoObjeto: "AQUISICAO",
    instrumento: "CONTRATO",
    dotacao: "",
    dotacaoImagens: [],
    quantidadeItens: "",
    quantidadeLotes: "",
    arquivoMagnetico: false,
    dataEdital: new Date().toISOString().split("T")[0],
    dataSessao: "",
    horaSessao: "",
    dataRecProp1: (() => {const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); return d.toISOString().split("T")[0]; })(),
    objeto: "",
    gestores: [{ nome: "", cargo: "" }],
    fiscais: [{ nome: "", cargo: "" }],
    execucao: "",
    prazoDevolucao: "",
    especificacoesEspeciais: "",
    vistoria: false,
    textoVistoria: "",
    amostra: false,
    textoAmostra: "",
    vigencia: "",
    documentosAdicionais: [],
    declAdicionais: "",
    contratante: "",
    contratada: "",
    valor: "",
    exclusivo: "NAO",
    prorrogacaoCheck: "SIM",
    itens: [],
    arquivoDfd: null,
    arquivoEtp: null,
    arquivoTr: null
  });
  
  const [carregando, setCarregando] = useState(false);
  const [statusTexto, setStatusTexto] = useState("Iniciando...");
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [geracaoSucesso, setGeracaoSucesso] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);

  const atualizarDados = (novosDados: Partial<typeof dados>) => {
    setDados((prev) => ({ ...prev, ...novosDados }));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [etapaAtual]);

  const validarEtapa = () => {
    switch (etapaAtual) {
      case 0:
        return !!(dados.numeroProcesso && dados.numeroModalidade && dados.modalidade && dados.criterios && dados.instrumento && dados.dataRecProp1 && dados.dataSessao && dados.horaSessao && dados.dataEdital);
      case 1:
        const hasG = dados.gestores && dados.gestores.length > 0 && dados.gestores[0].nome.trim() && dados.gestores[0].cargo.trim();
        const hasF = dados.fiscais && dados.fiscais.length > 0 && dados.fiscais[0].nome.trim() && dados.fiscais[0].cargo.trim();
        return !!(dados.tipoObjeto && dados.quantidadeItens && dados.quantidadeLotes && dados.dotacao && dados.objeto && dados.execucao && dados.prazoDevolucao && hasG && hasF);
      case 2:
        return !!(dados.vigencia && dados.valor && dados.exclusivo && dados.prorrogacaoCheck && dados.arquivoDfd && dados.arquivoEtp && dados.arquivoTr);
      default:
        return true;
    }
  };

  const avancar = () => {
    if (etapaAtual < 2) {
      setEtapaAtual(etapaAtual + 1);
    } else {
      confeccionarDocumentos();
    }
  };

  const voltar = () => {
    if (etapaAtual > 0) {
      setEtapaAtual(etapaAtual - 1);
    } else {
      window.location.href = "/";
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const confeccionarDocumentos = async () => {
    setCarregando(true);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setStatusTexto("A compilar o Edital...");

    try {
      const { dadosMapeados } = await mapearDadosWizard(dados);

      // Cast para Record<string, any> para contornar o erro TS7053
      const payload: Record<string, any> = { ...dadosMapeados };

      // Converte anexos para Base64 para suportar a arquitetura REST
      if (dados.arquivoDfd) payload["DFD_B64"] = await fileToBase64(dados.arquivoDfd as unknown as File);
      if (dados.arquivoEtp) payload["ETP_B64"] = await fileToBase64(dados.arquivoEtp as unknown as File);
      if (dados.arquivoTr)  payload["TR_B64"]  = await fileToBase64(dados.arquivoTr as unknown as File);

      // Mapeia a seleção do front para a chave exata exigida pelo backend
      let tipoEditalStr = "pregao_eletronico";
      if (dados.modalidade === "DISPENSA") tipoEditalStr = "dispensa";
      else if (dados.modalidade === "DISPENSA_BLL") tipoEditalStr = "dispensa_bll";
      else if (dados.modalidade === "PREGAO_PRESENCIAL") tipoEditalStr = "pregao_presencial";

      const { blob, filename } = await gerarEdital({
        tipo_edital: tipoEditalStr,
        dados_preenchimento: payload
      });

      // Dispara o download do .zip retornado pelo backend
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setGeracaoSucesso(true);
    } catch (erro: any) {
      let msg: string;
      if (typeof erro === "string") {
        msg = erro;
      } else if (erro?.message) {
        msg = erro.message;
      } else {
        try { msg = JSON.stringify(erro, null, 2); } catch { msg = ""; }
      }
      if (!msg || msg === "{}" || msg === "null" || msg === "undefined") {
        msg = "Erro desconhecido ao gerar o Edital.";
      }
      setErroMsg(msg);
    } finally {
      setCarregando(false);
    }
  };

  const renderizarEtapa = () => {
    switch (etapaAtual) {
      case 0: return <Step1 dados={dados} atualizarDados={atualizarDados} />;
      case 1: return <Step2 dados={dados} atualizarDados={atualizarDados} />;
      case 2: return <Step3 dados={dados} atualizarDados={atualizarDados} />;
      default: return null;
    }
  };

  if (carregando || erroMsg || geracaoSucesso) {
    return (
      <div className="wiz-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="wiz-card" style={{ width: "100%", maxWidth: "620px", textAlign: "center", padding: "40px" }}>
          {erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚠️</div>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--wiz-error)", fontSize: "22px" }}>Erro na Geração</h2>
              <div style={{ background: "var(--wiz-error-soft)", border: "1px solid var(--wiz-error)", borderRadius: "10px", padding: "16px", marginBottom: "24px", textAlign: "left", maxHeight: "260px", overflowY: "auto" }}>
                <pre style={{ color: "var(--wiz-error)", fontSize: "13px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit" }}>{erroMsg}</pre>
              </div>
              <button onClick={() => { setCarregando(false); setErroMsg(null); }} className="wiz-btn wiz-btn-primary">← Voltar e Tentar Novamente</button>
            </>
          )}

          {geracaoSucesso && !erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>✅</div>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--wiz-success)", fontSize: "22px" }}>Edital Gerado com Sucesso!</h2>
              <p style={{ color: "var(--wiz-text-3)", margin: "0 0 24px 0", fontSize: "14px" }}>
                Os documentos foram baixados. Verifique sua pasta Downloads.
              </p>
              <button onClick={() => { setCarregando(false); setGeracaoSucesso(false); setEtapaAtual(0); }} className="wiz-btn" style={{ background: "var(--wiz-success)", color: "#fff" }}>✓ Concluir</button>
            </>
          )}

          {carregando && !erroMsg && !geracaoSucesso && (
            <>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--wiz-text)", fontSize: "24px" }}>Gerando Edital</h2>
              <p style={{ color: "var(--wiz-text-3)", margin: "0 0 24px 0" }}>{statusTexto}</p>
              <div style={{ position: "relative", width: "100%", height: "6px", background: "var(--wiz-border)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", background: "var(--wiz-accent)", animation: "progress 1.5s ease-in-out infinite" }} />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const podeAvancar = validarEtapa();

  return (
    <div className={`wiz-root ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="wiz-header">
        <div className="wiz-header-inner">
          <div className="wiz-brand">
            <div className="wiz-brand-icon">
              <img src={logo} alt="Logo" />
            </div>
            MONTA EDITAL
          </div>
          
          <div className="wiz-stepper">
            {[
              { id: 0, nome: "Processo e Sessão", desc: "Dados básicos" },
              { id: 1, nome: "Objeto e Equipe", desc: "Detalhes e responsáveis" },
              { id: 2, nome: "Valores e Anexos", desc: "Vigência e documentos" }
            ].map((step, idx) => (
              <React.Fragment key={step.id}>
                <div className={`wiz-step-item ${etapaAtual === step.id ? 'active' : etapaAtual > step.id ? 'done' : 'pending'}`}>
                  <div className="wiz-step-content">
                    <div className="wiz-step-bubble">{etapaAtual > step.id ? "✓" : step.id + 1}</div>
                    <div className="wiz-step-labels">
                      <div className="wiz-step-name">{step.nome}</div>
                      <div className="wiz-step-desc">{step.desc}</div>
                    </div>
                  </div>
                </div>
                {idx < 2 && <div className={`wiz-step-connector ${etapaAtual > step.id ? 'done' : ''}`} />}
              </React.Fragment>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="wiz-theme-toggle"
            title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      <div className="wiz-body" ref={scrollRef}>
        {renderizarEtapa()}
      </div>

      <div className="wiz-footer">
        <div className="wiz-footer-left">
          <div className="wiz-step-label-footer">Passo {etapaAtual + 1} de 3</div>
          <div className="wiz-step-hint">Preencha os campos obrigatórios (*) para avançar</div>
        </div>
        <div className="wiz-footer-right">
          <button className="wiz-btn wiz-btn-ghost" onClick={voltar}>
            Voltar
          </button>
          <button
            className={`wiz-btn ${etapaAtual === 2 && podeAvancar ? "" : "wiz-btn-primary"}`}
            onClick={avancar}
            disabled={!podeAvancar}
            style={
              etapaAtual === 2
                ? {
                    background: podeAvancar ? "var(--wiz-success)" : "rgba(22, 163, 74, 0.4)",
                    color: podeAvancar ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
                    cursor: !podeAvancar ? "not-allowed" : "pointer",
                    pointerEvents: "auto"
                  }
                : {
                    cursor: !podeAvancar ? "not-allowed" : "pointer",
                    pointerEvents: "auto"
                  }
            }
          >
            {etapaAtual === 2 ? "Gerar Edital" : "Avançar"}
          </button>
        </div>
      </div>
    </div>
  );
}