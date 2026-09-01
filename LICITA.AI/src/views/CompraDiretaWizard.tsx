import React, { useState, useRef, useEffect, useContext } from "react";
import Step1 from "./steps/step1";
import Step2 from "./steps/step2";
import ConfigIA from "../components/configIA";
import PromptModal from "../components/promptModal";
import { ThemeContext } from "../context/ThemeContext";
import { lerConfigIA } from "../utils/storageLocal";
import { MODELO_PADRAO_POR_PROVEDOR } from "../providers/llm";
import { processarDadosIA } from "../providers/services/geradorIA";
import { mapearDadosWizard } from "../utils/mapearDados";
import { gerarFasePreparatoria } from "../api";

interface Props { onVoltar: () => void; }

export default function CompraDiretaWizard({ onVoltar }: Props) {
  const [etapaAtual, setEtapaAtual] = useState(0);
  const [dados, setDados] = useState<any>({
    objeto: "", necessidade: "", itens: [], amostra: false, vistoria: false,
    execucao: "", secretarias: [], contatosSecretarias: {}, gestores: [], fiscais: [],
    instrumento: "NOTA_FISCAL", prorrogar: false, meepp: "NAO", criterio: "ITEM",
    motivoCriterio: "", modalidade: "DISPENSA_EMAIL", motivoModalidade: "",
    pac: "NAO", motivoPac: "", vigenciaNum: 1, vigenciaUnidade: "Entrega",
    dotacao: "", caminhoImagemDotacao: "", fundamentoCompraDireta: ""
  });
  const [carregando, setCarregando] = useState(false);
  const [statusTexto, setStatusTexto] = useState("");
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [arquivoGerado, setArquivoGerado] = useState<any>(null);
  const [mostrarPrompt, setMostrarPrompt] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [etapaAtual]);

  const atualizarDados = (novos: any) => setDados((prev: any) => ({ ...prev, ...novos }));

  const validar = () => {
    if (etapaAtual === 0) return dados.objeto.trim() && dados.necessidade.trim() && dados.itens.length > 0 && dados.itens.every((i: any) => i.descricao?.trim() && Number(i.qtd) > 0 && Number(i.valor) > 0 && i.un?.trim());
    return !!dados.execucao.trim();
  };

  const gerar = async (instrucoes: string) => {
    setMostrarPrompt(false); setCarregando(true); setErroMsg(null); setStatusTexto("A preparar o DFD detalhado...");
    try {
      const config = lerConfigIA();
      const provedor = config.provedor || "openrouter";
      const chaveApi = config.chave_api || "";
      const modelo = config.modelo || MODELO_PADRAO_POR_PROVEDOR[provedor] || MODELO_PADRAO_POR_PROVEDOR.openrouter;
      if (!chaveApi) throw new Error("Chave de API não configurada.");

      const dadosMapeados: any = { ...mapearDadosWizard(dados), MODO_GERACAO: "COMPRA_DIRETA", FUNDAMENTO_COMPRA_DIRETA: dados.fundamentoCompraDireta || "" };
      dadosMapeados.INSTRUCOES_EXTRAS = [
        "MODO ESPECIAL: COMPRA DIRETA / NOTA AVULSA.",
        "Gerar somente um DFD detalhado, sem criar ETP ou TR.",
        "O DFD deve ter nível de detalhamento operacional semelhante a um Termo de Referência, mas continuar sendo formalmente um Documento de Formalização de Demanda.",
        dados.fundamentoCompraDireta ? `HIPÓTESE/FUNDAMENTO INFORMADO PELO USUÁRIO: ${dados.fundamentoCompraDireta}` : "A hipótese legal específica não foi informada; não invente inciso ou fundamento.",
        instrucoes.trim()
      ].filter(Boolean).join("\n\n");

      setStatusTexto(`A gerar DFD detalhado via ${modelo}...`);
      const dadosIa = await processarDadosIA(dadosMapeados, chaveApi, provedor, false, "DFD_DIRETA", modelo);

      setStatusTexto("A montar o documento DOCX...");
      const resultado = await gerarFasePreparatoria({ dados_usuario: dadosMapeados, dados_ia: dadosIa, modo_documento: "COMPRA_DIRETA" });
      const url = URL.createObjectURL(resultado.blob);
      const link = document.createElement("a"); link.href = url; link.download = resultado.filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setArquivoGerado(resultado);
    } catch (e: any) {
      setErroMsg(e?.message || String(e));
    }
  };

  if (carregando) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-base)" }}>
      <div style={{ background: "var(--bg-panel)", padding: "40px", borderRadius: "24px", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "620px", textAlign: "center" }}>
        {erroMsg ? <><div style={{ fontSize: 44 }}>⚠️</div><h2 style={{ color: "var(--btn-danger)" }}>Erro na geração</h2><pre style={{ textAlign: "left", whiteSpace: "pre-wrap", background: "var(--bg-subtle)", padding: 16, borderRadius: 10 }}>{erroMsg}</pre><button onClick={() => { setCarregando(false); setErroMsg(null); }} style={{ padding: "12px 28px", border: 0, borderRadius: 10, background: "var(--btn-primary)", color: "white" }}>Voltar</button></> : <><div style={{ fontSize: 44 }}>🧾</div><h2 style={{ color: "var(--text-main)" }}>{arquivoGerado ? "DFD gerado com sucesso" : "Gerando DFD detalhado"}</h2><p style={{ color: "var(--text-muted)" }}>{arquivoGerado ? "O download foi iniciado automaticamente." : statusTexto}</p>{arquivoGerado && <><button onClick={() => { const u = URL.createObjectURL(arquivoGerado.blob); const a = document.createElement("a"); a.href = u; a.download = arquivoGerado.filename; a.click(); URL.revokeObjectURL(u); }} style={{ padding: "12px 28px", border: 0, borderRadius: 10, background: "var(--btn-success)", color: "white", marginRight: 10 }}>Baixar novamente</button><button onClick={onVoltar} style={{ padding: "12px 28px", border: "1px solid var(--border)", borderRadius: 10, background: "transparent", color: "var(--text-main)" }}>Novo documento</button></>}</>}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-base)", fontFamily: "sans-serif" }}>
      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h1 style={{ margin: 0, fontSize: 22, color: "var(--text-main)" }}>{etapaAtual === 0 ? "Compra direta: objeto e itens" : "Compra direta: condições de fornecimento"}</h1><p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 14 }}>DFD detalhado para instrução de compra direta / nota avulsa.</p></div>
        <div style={{ display: "flex", gap: 10 }}><button onClick={() => setMostrarConfig(true)} style={{ width: 44, height: 44, border: 0, borderRadius: 8, background: "var(--bg-panel)" }}>⚙️</button><button onClick={toggleTheme} style={{ width: 44, height: 44, border: 0, borderRadius: 8, background: "var(--bg-subtle)" }}>{isDark ? "☀️" : "🌙"}</button></div>
      </div>
      <div style={{ flex: 1, padding: "0 40px", overflow: "hidden" }}><div style={{ height: "100%", background: "var(--bg-panel)", borderRadius: 24, padding: 20, boxShadow: "var(--shadow-md)" }}><div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
        {etapaAtual === 0 && <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: "var(--bg-subtle)" }}><label style={{ fontWeight: 600, color: "var(--text-main)" }}>Hipótese/fundamento da contratação direta (opcional)</label><p style={{ color: "var(--text-muted)", fontSize: 12 }}>Se você já souber o fundamento, informe. A IA não inventará inciso ou enquadramento jurídico quando esse campo estiver vazio.</p><textarea value={dados.fundamentoCompraDireta} onChange={e => atualizarDados({ fundamentoCompraDireta: e.target.value })} placeholder="Ex.: dispensa por valor, conforme enquadramento indicado no processo..." style={{ minHeight: 80, padding: 12, borderRadius: 10 }} /></div>}
        {etapaAtual === 0 ? <Step1 dados={dados} atualizarDados={atualizarDados} /> : <Step2 dados={dados} atualizarDados={atualizarDados} />}
      </div></div></div>
      <div style={{ padding: "24px 40px", display: "flex", justifyContent: "space-between" }}><button onClick={() => etapaAtual === 0 ? onVoltar() : setEtapaAtual(0)} style={{ width: 140, height: 44, borderRadius: 12, border: "2px solid var(--border)", background: "transparent", color: "var(--text-main)", fontWeight: "bold" }}>Voltar</button><button disabled={!validar()} onClick={() => etapaAtual === 0 ? setEtapaAtual(1) : setMostrarPrompt(true)} style={{ width: 180, height: 44, borderRadius: 12, border: 0, background: validar() ? "var(--btn-success)" : "var(--text-light)", color: "white", fontWeight: "bold" }}>{etapaAtual === 0 ? "Avançar" : "Gerar DFD"}</button></div>
      {mostrarConfig && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}><div style={{ background: "var(--bg-panel)", padding: 32, borderRadius: 24, width: "90%", maxWidth: 500 }}><button onClick={() => setMostrarConfig(false)} style={{ float: "right" }}>✕</button><h2>⚙️ Configurações de IA</h2><ConfigIA onSuccess={() => setMostrarConfig(false)} textoBotao="Salvar Alterações" /></div></div>}
      <PromptModal isOpen={mostrarPrompt} onClose={() => setMostrarPrompt(false)} onConfirm={gerar} />
    </div>
  );
}
