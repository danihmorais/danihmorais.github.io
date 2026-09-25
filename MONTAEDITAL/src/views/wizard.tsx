import React, { useState, useEffect, useRef, useContext } from "react";

import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import Step3 from "./steps/step3";
import { mapearDadosWizard } from "../utils/mapearDados";
import { ThemeContext } from "../context/ThemeContext";
import "./wizard.css";
import logo from "../assets/logo.png";
import { gerarEdital } from "../api";
import { criarDadosTeste, MODALIDADES_TESTE, type ModalidadeTeste } from "../utils/testesModalidade";


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
    dotacaoBlocos: [],
    quantidadeItens: "",
    quantidadeLotes: "",
    arquivoMagnetico: false,
    dataEdital: new Date().toISOString().split("T")[0],
    dataSessao: "",
    horaSessao: "09:00",
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
    pagamento: "",
    retirada: "",
    valor: "",
    exclusivo: "NAO",
    dataAutorizacao: "",
    secretaria: "",
    dataTr: "",
    servidorProcedimento: "",
    dataModalidade: "",
    justificativaProcedimento: "",
    dataDotacao: "",
    dataPedParecer: "",
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
  const [mostrarDiarios, setMostrarDiarios] = useState(false);
  const [mostrarTestes, setMostrarTestes] = useState(false);
  const [publicarDiarioEstadual, setPublicarDiarioEstadual] = useState(false);
  const [publicarDiarioFederal, setPublicarDiarioFederal] = useState(false);
  const [erroProcedimento, setErroProcedimento] = useState("");
  const [notificacao, setNotificacao] = useState<{ tipo: "success" | "error"; mensagem: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>("edital.zip");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const importDadosRef = useRef<HTMLInputElement>(null);

  const atualizarDados = (novosDados: Partial<typeof dados>) => {
    setDados((prev) => ({ ...prev, ...novosDados }));
  };

  const serializarArquivo = (arquivo: File | null): Promise<Record<string, any> | null> => {
    return new Promise((resolve, reject) => {
      if (!arquivo) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(arquivo);
      reader.onload = () => {
        resolve({
          name: arquivo.name,
          type: arquivo.type,
          lastModified: arquivo.lastModified,
          dataUrl: reader.result as string,
        });
      };
      reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo "${arquivo.name}".`));
    });
  };

  const desserializarArquivo = async (arquivo: any): Promise<File | null> => {
    if (!arquivo || typeof arquivo !== "object" || typeof arquivo.dataUrl !== "string") {
      return null;
    }

    const resposta = await fetch(arquivo.dataUrl);
    const blob = await resposta.blob();
    return new File(
      [blob],
      String(arquivo.name || "anexo.docx"),
      {
        type: String(arquivo.type || blob.type || "application/octet-stream"),
        lastModified: Number(arquivo.lastModified) || Date.now(),
      }
    );
  };

  const exportarDados = async () => {
    try {
      const pacote = {
        tipo: "MONTAEDITAL_DADOS",
        versao: 1,
        exportadoEm: new Date().toISOString(),
        dados: {
          ...dados,
          arquivoDfd: await serializarArquivo(dados.arquivoDfd as unknown as File | null),
          arquivoEtp: await serializarArquivo(dados.arquivoEtp as unknown as File | null),
          arquivoTr: await serializarArquivo(dados.arquivoTr as unknown as File | null),
        },
      };

      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomeBase = String(dados.numeroProcesso || dados.numeroModalidade || "dados")
        .replace(/[^a-zA-Z0-9._-]+/g, "_");

      a.href = url;
      a.download = `montaedital-${nomeBase}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (erro: any) {
      setNotificacao({ tipo: "error", mensagem: erro?.message || "Não foi possível exportar os dados." });
    }
  };

  const importarDados = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;

    try {
      const texto = await arquivo.text();
      const pacote = JSON.parse(texto);
      const dadosImportados =
        pacote?.dados && typeof pacote.dados === "object"
          ? pacote.dados
          : pacote;

      if (!dadosImportados || typeof dadosImportados !== "object" || Array.isArray(dadosImportados)) {
        throw new Error("O arquivo selecionado não contém dados válidos do MONTA EDITAL.");
      }

      const atualizacao: any = { ...dadosImportados };

      if (
        Array.isArray(atualizacao.documentosAdicionais) &&
        atualizacao.documentosAdicionais.every((item: any) => typeof item !== "string" || item.trim() === "")
      ) {
        atualizacao.documentosAdicionais = [];
      }

      if (
        Array.isArray(atualizacao.declAdicionais) &&
        atualizacao.declAdicionais.every((item: any) => typeof item !== "string" || item.trim() === "")
      ) {
        atualizacao.declAdicionais = [];
      }

      if (Object.prototype.hasOwnProperty.call(dadosImportados, "arquivoDfd")) {
        atualizacao.arquivoDfd = await desserializarArquivo(dadosImportados.arquivoDfd);
      }
      if (Object.prototype.hasOwnProperty.call(dadosImportados, "arquivoEtp")) {
        atualizacao.arquivoEtp = await desserializarArquivo(dadosImportados.arquivoEtp);
      }
      if (Object.prototype.hasOwnProperty.call(dadosImportados, "arquivoTr")) {
        atualizacao.arquivoTr = await desserializarArquivo(dadosImportados.arquivoTr);
      }

      setDados((prev) => ({ ...prev, ...atualizacao }) as any);
      setEtapaAtual(0);
      setMostrarTestes(false);
      setMostrarDiarios(false);
      setPublicarDiarioEstadual(false);
      setPublicarDiarioFederal(false);
      setErroProcedimento("");
      setErroMsg(null);
      setGeracaoSucesso(false);
      setCarregando(false);
      setDownloadUrl(null);
      setDownloadFilename("edital.zip");

      setNotificacao({ tipo: "success", mensagem: "Dados pré-preenchidos importados com sucesso." });
    } catch (erro: any) {
      setNotificacao({ tipo: "error", mensagem: erro?.message || "Não foi possível importar o arquivo JSON." });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [etapaAtual]);

  useEffect(() => {
    if (!notificacao) return;
    const timer = window.setTimeout(() => setNotificacao(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notificacao]);

function numeroProcessoValido(valor: string): boolean {
    return /^(?:\d{2}|\d{3})\/\d{4}$/.test(valor);
  }

  const validarEtapa = () => {
    const isLeilao = dados.modalidade === "LEILAO_ELETRONICO";

    switch (etapaAtual) {
      case 0:
        return !!(
          numeroProcessoValido(dados.numeroProcesso) &&
          numeroProcessoValido(dados.numeroModalidade) &&
          dados.modalidade &&
          dados.criterios &&
          dados.instrumento &&
          dados.dataRecProp1 &&
          dados.dataSessao &&
          dados.horaSessao &&
          dados.dataEdital
        );

      case 1: {
        const hasG =
          dados.gestores?.length > 0 &&
          dados.gestores[0].nome.trim() &&
          dados.gestores[0].cargo.trim();

        const hasF =
          dados.fiscais?.length > 0 &&
          dados.fiscais[0].nome.trim() &&
          dados.fiscais[0].cargo.trim();

        // LEILÃO
        if (isLeilao) {
          return !!(
            dados.quantidadeItens &&
            dados.quantidadeLotes &&
            dados.objeto &&
            dados.retirada &&
            hasG &&
            hasF
          );
        }

        // DEMAIS MODALIDADES
        return !!(
          dados.tipoObjeto &&
          dados.quantidadeItens &&
          dados.quantidadeLotes &&
          (dados.dotacao || dados.dotacaoBlocos) &&
          dados.objeto &&
          dados.execucao &&
          dados.prazoDevolucao &&
          hasG &&
          hasF
        );
      }

      case 2:
        if (isLeilao) {
          return !!(
            dados.exclusivo &&
            dados.arquivoDfd &&
            dados.arquivoEtp &&
            dados.arquivoTr
          );
        }

        return !!(
          dados.vigencia &&
          dados.valor &&
          dados.exclusivo &&
          dados.pagamento &&
          dados.prorrogacaoCheck &&
          dados.arquivoDfd &&
          dados.arquivoEtp &&
          dados.arquivoTr
        );

      default:
        return true;
    }
  };

  const avancar = () => {
    if (etapaAtual < 2) {
      setEtapaAtual(etapaAtual + 1);
    } else {
      setMostrarDiarios(true);
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

      const payload: Record<string, any> = { ...dadosMapeados };

      if (dados.arquivoDfd) payload["DFD_B64"] = await fileToBase64(dados.arquivoDfd as unknown as File);
      if (dados.arquivoEtp) payload["ETP_B64"] = await fileToBase64(dados.arquivoEtp as unknown as File);
      if (dados.arquivoTr)  payload["TR_B64"]  = await fileToBase64(dados.arquivoTr as unknown as File);

      let tipoEditalStr = "pregao_eletronico";
      if (dados.modalidade === "DISPENSA") tipoEditalStr = "dispensa";
      else if (dados.modalidade === "DISPENSA_BLL") tipoEditalStr = "dispensa_bll";
      else if (dados.modalidade === "PREGAO_PRESENCIAL") tipoEditalStr = "pregao_presencial";
      else if (dados.modalidade === "LEILAO_ELETRONICO") tipoEditalStr = "leilao_eletronico";

      payload.publicar_diario_estadual = publicarDiarioEstadual;
      payload.publicar_diario_federal = publicarDiarioFederal;

      const { blob, filename } = await gerarEdital({
        tipo_edital: tipoEditalStr,
        dados_preenchimento: payload
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setDownloadUrl(url);
      setDownloadFilename(filename);
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

  const confirmarGeracao = () => {
    const camposObrigatorios = [
      [dados.dataAutorizacao, "Data de autorização do Prefeito"],
      [dados.secretaria, "Secretaria"],
      [dados.dataTr, "Data do Termo de Referência"],
      [dados.servidorProcedimento, "Servidor"],
      [dados.dataModalidade, "Data do pedido da modalidade ao Prefeito"],
      [dados.dataDotacao, "Data do pedido de dotação orçamentária"],
      [dados.dataPedParecer, "Data do pedido de parecer jurídico"],
    ] as const;

    const faltante = camposObrigatorios.find(([valor]) => !String(valor || "").trim());
    if (faltante) {
      setErroProcedimento(`Preencha o campo obrigatório: ${faltante[1]}.`);
      return;
    }

    if (dados.modalidade === "PREGAO_PRESENCIAL" && !String(dados.justificativaProcedimento || "").trim()) {
      setErroProcedimento("Para Pregão Presencial, informe a justificativa para a utilização da forma presencial.");
      return;
    }

    if (String(dados.dataModalidade) < String(dados.dataAutorizacao)) {
      setErroProcedimento("A Data do pedido da modalidade ao Prefeito não pode ser anterior à Data de autorização do Prefeito.");
      return;
    }

    setErroProcedimento("");
    setMostrarDiarios(false);
    confeccionarDocumentos();
  };

  const cancelarGeracao = () => {
    setMostrarDiarios(false);
    setErroProcedimento("");
  };

  const baixarManualmente = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const encerrarFluxo = () => {
    if (downloadUrl) {
      window.URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setCarregando(false);
    setGeracaoSucesso(false);
    setMostrarDiarios(false);
    setPublicarDiarioEstadual(false);
    setPublicarDiarioFederal(false);
    setEtapaAtual(0);
  };

  const aplicarTesteModalidade = (modalidade: ModalidadeTeste) => {
    if (downloadUrl) {
      window.URL.revokeObjectURL(downloadUrl);
    }

    setDados((prev) => ({ ...prev, ...criarDadosTeste(modalidade) } as any));
    setEtapaAtual(0);
    setMostrarTestes(false);
    setMostrarDiarios(false);
    setPublicarDiarioEstadual(false);
    setPublicarDiarioFederal(false);
    setErroProcedimento("");
    setErroMsg(null);
    setGeracaoSucesso(false);
    setCarregando(false);
    setDownloadUrl(null);
    setDownloadFilename("edital.zip");
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
              <p style={{ color: "var(--wiz-text-3)", margin: "0 0 16px 0", fontSize: "14px" }}>
                Os documentos foram baixados. Verifique sua pasta Downloads.
              </p>
              {downloadUrl && (
                <button
                  onClick={baixarManualmente}
                  className="wiz-btn wiz-btn-ghost"
                  style={{ marginBottom: "16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  ⬇️ Baixar novamente (caso não tenha baixado automaticamente)
                </button>
              )}
              <div>
                <button onClick={encerrarFluxo} className="wiz-btn" style={{ background: "var(--wiz-success)", color: "#fff" }}>✓ Concluir</button>
              </div>
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
      {notificacao && (
        <div
          className={`wiz-toast ${notificacao.tipo}`}
          role="status"
          aria-live="polite"
        >
          <div className="wiz-toast-icon">
            {notificacao.tipo === "success" ? "✓" : "!"}
          </div>
          <div className="wiz-toast-message">{notificacao.mensagem}</div>
          <button
            type="button"
            className="wiz-toast-close"
            onClick={() => setNotificacao(null)}
            aria-label="Fechar notificação"
            title="Fechar"
          >
            ×
          </button>
        </div>
      )}

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

          <div className="wiz-header-actions">
            <input
              ref={importDadosRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={importarDados}
            />

            <button
              type="button"
              className="wiz-test-button"
              onClick={exportarDados}
              title="Exportar os dados pré-preenchidos para JSON"
            >
              ⬇️ Exportar
            </button>

            <button
              type="button"
              className="wiz-test-button"
              onClick={() => importDadosRef.current?.click()}
              title="Importar dados pré-preenchidos de um JSON"
            >
              ⬆️ Importar
            </button>

            <button
              type="button"
              className="wiz-test-button"
              onClick={() => setMostrarTestes(true)}
              aria-haspopup="dialog"
              aria-expanded={mostrarTestes}
              title="Carregar dados de teste completos"
            >
              🧪 Testes
            </button>

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
      </div>

      <div className="wiz-body" ref={scrollRef}>
        {renderizarEtapa()}
      </div>

      {mostrarTestes && (
        <div
          className="wiz-test-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMostrarTestes(false);
          }}
        >
          <div
            className="wiz-test-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wiz-test-title"
          >
            <div className="wiz-card-header" style={{ marginBottom: "18px" }}>
              <div className="wiz-card-icon">🧪</div>
              <div>
                <div id="wiz-test-title" className="wiz-card-title">
                  Escolha a modalidade para testar
                </div>
                <div className="wiz-card-subtitle">
                  Todos os campos obrigatórios serão preenchidos automaticamente, inclusive os dados do Procedimento e os anexos DOCX.
                </div>
              </div>
              <button
                type="button"
                className="wiz-btn-remove"
                onClick={() => setMostrarTestes(false)}
                title="Fechar"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="wiz-test-options">
              {MODALIDADES_TESTE.map((teste) => (
                <button
                  key={teste.value}
                  type="button"
                  className="wiz-test-option"
                  onClick={() => aplicarTesteModalidade(teste.value)}
                >
                  <span className="wiz-test-option-title">{teste.label}</span>
                  <span className="wiz-test-option-desc">{teste.descricao}</span>
                </button>
              ))}
            </div>

            <div className="wiz-test-note">
              Os arquivos DFD, ETP e TR usados no teste são DOCX válidos e ficam apenas na memória do navegador até a geração.
            </div>
          </div>
        </div>
      )}


      {mostrarDiarios && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiz-diarios-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="wiz-card"
            style={{
              width: "100%",
              maxWidth: "760px",
              maxHeight: "88vh",
              overflowY: "auto",
              margin: 0,
              padding: "28px",
              boxShadow: "var(--wiz-shadow-md)",
            }}
          >
            <div className="wiz-card-header" style={{ marginBottom: "18px" }}>
              <div className="wiz-card-icon">📋</div>
              <div>
                <div id="wiz-diarios-title" className="wiz-card-title">
                  Dados do procedimento e publicação
                </div>
                <div className="wiz-card-subtitle">
                  Preencha os dados do Procedimento e, ao final, selecione os Diários nos quais pretende publicar o aviso.
                </div>
              </div>
            </div>

            <div className="wiz-grid-2" style={{ marginBottom: "18px" }}>
              <div className="wiz-field">
                <label className="wiz-label">
                  Data de autorização do Prefeito <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  className="wiz-input"
                  value={dados.dataAutorizacao || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ dataAutorizacao: e.target.value });
                  }}
                />
              </div>

              <div className="wiz-field">
                <label className="wiz-label">
                  Secretaria <span className="req-star">*</span>
                </label>
                <select
                  className="wiz-select"
                  value={dados.secretaria || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ secretaria: e.target.value });
                  }}
                >
                  <option value="">Selecione a Secretaria</option>
                  <option value="Diversos">Diversos</option>
                  <option value="Gabinete do Prefeito">Gabinete do Prefeito</option>
                  <option value="Fundo Social de Solidariedade">Fundo Social de Solidariedade</option>
                  <option value="Secretaria de Administração">Secretaria de Administração</option>
                  <option value="Secretaria de Educação, Cultura, Esporte e Lazer">Secretaria de Educação, Cultura, Esporte e Lazer</option>
                  <option value="Secretaria de Desenvolvimento e Promoção Social">Secretaria de Desenvolvimento e Promoção Social</option>
                  <option value="Secretaria de Saúde">Secretaria de Saúde</option>
                  <option value="Secretaria de Obras e Serviços Públicos">Secretaria de Obras e Serviços Públicos</option>
                  <option value="Secretaria de Agricultura, Meio Ambiente, Industria e Comércio">Secretaria de Agricultura, Meio Ambiente, Industria e Comércio</option>
                </select>
              </div>

              <div className="wiz-field">
                <label className="wiz-label">
                  Data do Termo de Referência <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  className="wiz-input"
                  value={dados.dataTr || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ dataTr: e.target.value });
                  }}
                />
              </div>

              <div className="wiz-field">
                <label className="wiz-label">Gestor (utilizado no Procedimento)</label>
                <div className="wiz-input" style={{ minHeight: "40px", display: "flex", alignItems: "center", lineHeight: 1.35 }}>
                  {(dados.gestores || [])
                    .map((g: any) => g.nome)
                    .filter((nome: string) => nome.trim())
                    .join("; ") || "Nenhum gestor informado"}
                </div>
              </div>

              <div className="wiz-field">
                <label className="wiz-label">
                  Servidor <span className="req-star">*</span>
                </label>
                <select
                  className="wiz-select"
                  value={dados.servidorProcedimento || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ servidorProcedimento: e.target.value });
                  }}
                >
                  <option value="">Selecione o servidor</option>
                  <option value="FERNANDA REGINA YONEZAWA SHIMADA">FERNANDA REGINA YONEZAWA SHIMADA</option>
                  <option value="EDIVALDO ROCHA DA SILVA JUNIOR">EDIVALDO ROCHA DA SILVA JUNIOR</option>
                </select>
              </div>

              <div className="wiz-field">
                <label className="wiz-label">
                  Data do pedido da modalidade ao Prefeito <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  className="wiz-input"
                  min={dados.dataAutorizacao || undefined}
                  value={dados.dataModalidade || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ dataModalidade: e.target.value });
                  }}
                />
              </div>
            </div>

            {dados.modalidade === "PREGAO_PRESENCIAL" && (
              <div className="wiz-field" style={{ marginBottom: "18px" }}>
                <label className="wiz-label">
                  Justificativa para utilização da forma presencial <span className="req-star">*</span>
                </label>
                <textarea
                  className="wiz-textarea"
                  value={dados.justificativaProcedimento || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ justificativaProcedimento: e.target.value });
                  }}
                  placeholder="Informe a justificativa para a realização do Pregão Presencial."
                />
              </div>
            )}

            <div className="wiz-grid-2" style={{ marginBottom: "18px" }}>
              <div className="wiz-field">
                <label className="wiz-label">
                  Data do pedido de dotação orçamentária <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  className="wiz-input"
                  value={dados.dataDotacao || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ dataDotacao: e.target.value });
                  }}
                />
              </div>

              <div className="wiz-field">
                <label className="wiz-label">
                  Data do pedido de parecer jurídico <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  className="wiz-input"
                  value={dados.dataPedParecer || ""}
                  onChange={(e) => {
                    setErroProcedimento("");
                    atualizarDados({ dataPedParecer: e.target.value });
                  }}
                />
              </div>
            </div>

            {erroProcedimento && (
              <div
                style={{
                  background: "var(--wiz-error-soft)",
                  border: "1px solid var(--wiz-error)",
                  color: "var(--wiz-error)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {erroProcedimento}
              </div>
            )}

            <div className="wiz-subsection-title" style={{ marginBottom: "10px" }}>
              Publicação do Aviso
            </div>

            <div style={{ display: "grid", gap: "10px", marginBottom: "24px" }}>
              <label
                className="wiz-toggle-row"
                style={{ cursor: "pointer" }}
                onClick={() => setPublicarDiarioEstadual((v) => !v)}
              >
                <div className="wiz-toggle-info">
                  <div className="wiz-toggle-title">Diário Estadual</div>
                  <div className="wiz-toggle-desc">Gerar o Aviso de Edital para publicação no Diário Estadual.</div>
                </div>
                <div className={publicarDiarioEstadual ? "wiz-switch on" : "wiz-switch"} />
              </label>

              <label
                className="wiz-toggle-row"
                style={{ cursor: "pointer" }}
                onClick={() => setPublicarDiarioFederal((v) => !v)}
              >
                <div className="wiz-toggle-info">
                  <div className="wiz-toggle-title">Diário Federal</div>
                  <div className="wiz-toggle-desc">Gerar o Aviso de Edital para publicação no Diário Federal.</div>
                </div>
                <div className={publicarDiarioFederal ? "wiz-switch on" : "wiz-switch"} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={cancelarGeracao}
                className="wiz-btn wiz-btn-ghost"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarGeracao}
                className="wiz-btn wiz-btn-primary"
              >
                ✓ Gerar documentos
              </button>
            </div>
          </div>
        </div>
      )}

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
