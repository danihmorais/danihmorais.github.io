import React, { useState, useEffect, useRef, useContext } from "react";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import Step4 from "./steps/step4";
import Step5 from "./steps/step5";
import { mapearDadosWizard } from "../utils/mapearDados";
import { processarDadosIA } from "../providers/services/geradorIA";
import { obterMelhorModelo } from "../providers/llm";
import ConfigIA from "../components/configIA";
import PromptModal from "../components/promptModal";
import { ThemeContext } from "../context/ThemeContext";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [mostrarPromptModal, setMostrarPromptModal] = useState(false);

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
        return (
          dados.objeto.trim() !== "" &&
          dados.necessidade.trim() !== "" &&
          dados.itens.length > 0 &&
          dados.itens.every(
            (i: any) => i.descricao.trim() !== "" && i.qtd > 0 && i.valor > 0 && i.un.trim() !== ""
          )
        );
      case 1:
        return dados.execucao.trim() !== "";
      case 2:
        return (
          dados.secretarias.length > 0 &&
          dados.secretarias.every((sec: string) => dados.contatosSecretarias[sec]?.length > 0)
        );
      case 3:
        return dados.gestores.length > 0 && dados.fiscais.length > 0;
      case 4:
        const criterioValido = (dados.criterio === "ITEM") || ((dados.criterio === "GLOBAL" || dados.criterio === "LOTE") && dados.motivoCriterio.trim() !== "");
        const modalidadeValida = dados.modalidade === "PREGAO_ELETRONICO" || dados.motivoModalidade.trim() !== "";
        const pacValido = dados.pac === "SIM" || dados.motivoPac.trim() !== "";
        const dotacaoValida = dados.dotacao.trim() !== "" || !!dados.caminhoImagemDotacao;
        return dados.instrumento !== "" && criterioValido && modalidadeValida && pacValido && dotacaoValida;
      default:
        return true;
    }
  };

  const avancar = () => {
    if (etapaAtual < 4) {
      setEtapaAtual(etapaAtual + 1);
    } else {
      setMostrarPromptModal(true);
    }
  };

  const voltar = () => {
    if (etapaAtual > 0) {
      setEtapaAtual(etapaAtual - 1);
    }
  };

  const confeccionarDocumentos = async (instrucoes: string) => {
    setMostrarPromptModal(false);
    setCarregando(true);
    setErroMsg(null);
    setGeracaoSucesso(false);
    setStatusTexto("A ler configurações da IA...");

    try {
      const config: any = await invoke("ler_config_ia");
      const provedor = config.provedor || "gemini";
      const chaveApi = config.chave_api || "";

      if (!chaveApi) {
        setErroMsg("Chave de API não configurada. Por favor, volte ao início e insira a sua chave.");
        return;
      }

      const dadosMapeados = mapearDadosWizard(dados);
      dadosMapeados["INSTRUCOES_EXTRAS"] = instrucoes;
      
      const meeppExclusivo = dados.meepp === "SIM";

      setStatusTexto("A identificar a melhor inteligência artificial disponível para a sua conta...");
      const modeloEscolhido = await obterMelhorModelo(provedor, chaveApi);

      setStatusTexto(`A gerar Documento de Formalização de Demanda (DFD) via ${modeloEscolhido}...`);
      const dadosIaDfd = await processarDadosIA(dadosMapeados, chaveApi, provedor, meeppExclusivo, "DFD", modeloEscolhido);

      setStatusTexto(`A estruturar o Estudo Técnico Preliminar (ETP) via ${modeloEscolhido}...`);
      const dadosIaEtp = await processarDadosIA(dadosMapeados, chaveApi, provedor, meeppExclusivo, "ETP", modeloEscolhido);

      setStatusTexto(`A compor o Termo de Referência (TR) via ${modeloEscolhido}...`);
      const dadosIaTr = await processarDadosIA(dadosMapeados, chaveApi, provedor, meeppExclusivo, "TR", modeloEscolhido);

      const dadosIaFinais = { ...dadosIaDfd, ...dadosIaEtp, ...dadosIaTr };

      setStatusTexto("A preencher os ficheiros DOCX finais...");
      await invoke("gerar_documentos", {
        dadosUsuario: dadosMapeados,
        dadosIa: dadosIaFinais
      });

      setGeracaoSucesso(true);

    } catch (erro: any) {
      console.error("Erro completo:", erro);

      let msg: string;
      if (typeof erro === "string") {
        msg = erro;
      } else if (erro?.message) {
        msg = erro.message;
      } else {
        try { msg = JSON.stringify(erro, null, 2); } catch { msg = ""; }
      }

      if (!msg || msg === "{}" || msg === "null" || msg === "undefined") {
        msg = "Erro desconhecido. Possíveis causas:\n• Chave de API inválida ou expirada\n• Sem conexão com a internet\n• Resposta inesperada da API de IA\n• Python não instalado ou indisponível no PATH";
      }

      setErroMsg(msg);
    }
  };

  const renderizarEtapa = () => {
    switch (etapaAtual) {
      case 0: return <Step1 dados={dados} atualizarDados={atualizarDados} />;
      case 1: return <Step2 dados={dados} atualizarDados={atualizarDados} />;
      case 2: return <Step3 dados={dados} atualizarDados={atualizarDados} />;
      case 3: return <Step4 dados={dados} atualizarDados={atualizarDados} />;
      case 4: return <Step5 dados={dados} atualizarDados={atualizarDados} />;
      default: return <div style={{ padding: "2rem" }}>Próximas etapas na sequência...</div>;
    }
  };

  if (carregando) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "var(--bg-base)"
      }}>
        <div style={{
          background: "var(--bg-panel)",
          padding: "40px",
          borderRadius: "24px",
          boxShadow: "var(--shadow-lg)",
          textAlign: "center",
          width: "100%",
          maxWidth: "620px"
        }}>
          {erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚠️</div>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--btn-danger)", fontSize: "22px" }}>
                Erro na Geração
              </h2>
              <div style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--btn-danger)",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "24px",
                textAlign: "left",
                maxHeight: "260px",
                overflowY: "auto"
              }}>
                <pre style={{
                  color: "var(--btn-danger)",
                  fontSize: "13px",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "inherit"
                }}>
                  {erroMsg}
                </pre>
              </div>
              <button
                onClick={() => { setCarregando(false); setErroMsg(null); }}
                style={{
                  padding: "12px 32px",
                  background: "var(--btn-primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                ← Voltar e Tentar Novamente
              </button>
            </>
          )}

          {geracaoSucesso && !erroMsg && (
            <>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>✅</div>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--btn-success)", fontSize: "22px" }}>
                Documentos Gerados com Sucesso!
              </h2>
              <p style={{ color: "var(--text-muted)", margin: "0 0 24px 0", fontSize: "14px" }}>
                Os arquivos foram salvos na pasta{" "}
                <span
                  onClick={() => invoke("abrir_pasta_documentos")}
                  style={{
                    color: "var(--btn-primary)",
                    fontWeight: "bold",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Documentos_Gerados
                </span>.
              </p>
              <button
                onClick={() => { setCarregando(false); setGeracaoSucesso(false); }}
                style={{
                  padding: "12px 32px",
                  background: "var(--btn-success)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                ✓ Concluir
              </button>
            </>
          )}

          {!erroMsg && !geracaoSucesso && (
            <>
              <h2 style={{ margin: "0 0 16px 0", color: "var(--text-main)", fontSize: "24px" }}>
                Gerando Artefatos com IA
              </h2>
              <p style={{ color: "var(--text-muted)", margin: "0 0 24px 0" }}>{statusTexto}</p>
              <div style={{
                width: "100%",
                height: "6px",
                background: "var(--border)",
                borderRadius: "4px",
                overflow: "hidden"
              }}>
                <div style={{
                  width: "50%",
                  height: "100%",
                  background: "var(--btn-primary)",
                  transition: "width 0.3s",
                  animation: "progress 2s infinite"
                }} />
              </div>
              <p style={{ color: "var(--text-light)", fontSize: "12px", marginTop: "16px" }}>
                Este processo pode levar alguns minutos...
              </p>
            </>
          )}

        </div>
      </div>
    );
  }

  const podeAvancar = validarEtapa();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "var(--bg-base)", transition: "background-color 0.3s", fontFamily: "sans-serif" }}>
      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", color: "var(--text-main)" }}>
              {etapaAtual === 0 && "Etapa 1: Objeto e Justificativa"}
              {etapaAtual === 1 && "Etapa 2: Condições de Execução"}
              {etapaAtual === 2 && "Etapa 3: Unidade Demandante"}
              {etapaAtual === 3 && "Etapa 4: Equipe de Planejamento"}
              {etapaAtual === 4 && "Etapa 5: Definição do Instrumento"}
            </h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
              Forneça os dados do processo com clareza para gerar os artefatos corretamente.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "var(--text-muted)", fontWeight: "bold", fontSize: "14px" }}>
            Passo {etapaAtual + 1} de 5
          </span>

          <button
            onClick={() => setMostrarConfig(true)}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              width: "44px",
              height: "44px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-sm)",
              fontSize: "20px"
            }}
            title="Configurações de IA"
          >
            ⚙️
          </button>
                <button 
        onClick={toggleTheme} 
        style={{ width: "44px", height: "44px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--bg-subtle)", color: "var(--text-main)" }}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "0 40px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          background: "var(--bg-panel)",
          borderRadius: "24px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)",
          padding: "16px"
        }}>
          <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", padding: "16px" }}>
            {renderizarEtapa()}
          </div>
        </div>
      </div>
      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between" }}>
        <button
          onClick={voltar}
          disabled={etapaAtual === 0}
          style={{
            width: "140px",
            height: "44px",
            borderRadius: "12px",
            border: "2px solid var(--border)",
            background: "transparent",
            color: "var(--text-main)",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: etapaAtual === 0 ? "not-allowed" : "pointer",
            opacity: etapaAtual === 0 ? 0.5 : 1
          }}
        >
          Voltar
        </button>
        <button
          onClick={avancar}
          disabled={!podeAvancar}
          style={{
            width: "140px",
            height: "44px",
            borderRadius: "12px",
            border: "none",
            background: !podeAvancar ? "var(--text-light)" : (etapaAtual === 4 ? "var(--btn-success)" : "var(--btn-primary)"),
            color: "#ffffff",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: !podeAvancar ? "not-allowed" : "pointer"
          }}
        >
          {etapaAtual === 4 ? "Confeccionar" : "Avançar"}
        </button>
      </div>
      
      {mostrarConfig && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--bg-panel)", padding: "32px", borderRadius: "24px", width: "100%", maxWidth: "500px", position: "relative", boxShadow: "var(--shadow-lg)" }}>
            <button 
              onClick={() => {
                setMostrarConfig(false);
              }} 
              style={{ position: "absolute", top: "20px", right: "20px", background: "var(--bg-subtle)", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", fontWeight: "bold" }}
            >
              ✕
            </button>
            <h2 style={{ marginTop: 0, marginBottom: "24px", color: "var(--text-main)", textAlign: "center", fontSize: "20px" }}>
              ⚙️ Configurações de IA
            </h2>
            <ConfigIA 
              onSuccess={() => setMostrarConfig(false)} 
              textoBotao="Salvar Alterações" 
            />
          </div>
        </div>
      )}
      <PromptModal 
        isOpen={mostrarPromptModal} 
        onClose={() => setMostrarPromptModal(false)} 
        onConfirm={confeccionarDocumentos} 
      />
    </div>
  );
}