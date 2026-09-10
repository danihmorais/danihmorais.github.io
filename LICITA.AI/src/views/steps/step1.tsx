import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { calcularValorEstimadoItens } from "../../utils/regrasContratacao";
import { melhorarDescricaoItem } from "../../providers/services/contratacaoDiretaIA";
import { lerConfigIA } from "../../utils/storageLocal";
import { MODELO_PADRAO_POR_PROVEDOR } from "../../providers/llm";

export default function Step1({ dados = { itens: [], objeto: "", necessidade: "" }, atualizarDados }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [itemEmMelhoria, setItemEmMelhoria] = useState<number | string | null>(null);
  const itens = dados.itens || [];
  const objeto = dados.objeto || "";
  const necessidade = dados.necessidade || "";

  const formatarMoeda = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const parseMoeda = (texto: string) => Number(String(texto).replace(/[^\d]/g, "")) / 100;
  const extrairNumero = (valor: any) => {
    if (typeof valor === "number") return valor;
    const texto = String(valor || "0").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    return Number(texto) || 0;
  };
  const normalizar = (valor: any) => String(valor || "").trim().toLowerCase();

  const atualizarItem = (id: any, campo: string, valor: any) => {
    atualizarDados({ ...dados, itens: itens.map((item: any) => item.id === id ? { ...item, [campo]: valor } : item) });
  };

  const adicionarItem = () => atualizarDados({
    ...dados,
    itens: [...itens, { id: Date.now() + Math.random(), numero: itens.length + 1, descricao: "", un: "UN", qtd: 1, valor: 0 }],
  });

  const removerItem = (id: any) => atualizarDados({ ...dados, itens: itens.filter((item: any) => item.id !== id) });

  const moverItem = (index: number, direcao: number) => {
    const novoIndex = index + direcao;
    if (novoIndex < 0 || novoIndex >= itens.length) return;
    const novosItens = [...itens];
    [novosItens[index], novosItens[novoIndex]] = [novosItens[novoIndex], novosItens[index]];
    atualizarDados({ ...dados, itens: novosItens });
  };

  const melhorarItem = async (item: any) => {
    if (!String(item.descricao || "").trim()) return;
    const config = lerConfigIA();
    const apiKey = config.chave_api || "";
    const modelo = config.modelo || MODELO_PADRAO_POR_PROVEDOR[config.provedor || "openrouter"] || MODELO_PADRAO_POR_PROVEDOR.openrouter;
    if (!apiKey) {
      alert("Nenhuma API de IA está configurada.");
      return;
    }
    setItemEmMelhoria(item.id);
    try {
      const descricao = await melhorarDescricaoItem(String(item.descricao), objeto, necessidade, apiKey, modelo);
      atualizarItem(item.id, "descricao", descricao);
    } catch (erro: any) {
      console.error("Erro ao melhorar descrição:", erro);
      alert(erro?.message || "Não foi possível melhorar a descrição deste item.");
    } finally {
      setItemEmMelhoria(null);
    }
  };

  const importarXlsx = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        const indiceCabecalho = linhas.findIndex((linha) => {
          const cabecalhos = linha.map(normalizar);
          return cabecalhos.includes("item") && cabecalhos.includes("nome");
        });
        if (indiceCabecalho < 0) throw new Error("Cabeçalho não encontrado. A planilha deve possuir as colunas Item e Nome.");
        const cabecalhos = linhas[indiceCabecalho].map(normalizar);
        const coluna = (nomes: string[]) => nomes.map(normalizar).map((nome) => cabecalhos.indexOf(nome)).find((i) => i >= 0) ?? -1;
        const cItem = coluna(["item"]);
        const cNome = coluna(["nome"]);
        const cQtd = coluna(["quantidade"]);
        const cUn = coluna(["unidade"]);
        const cValor = coluna(["valor unitário", "valor unitario", "valor", "preço unitário", "preco unitario"]);
        if (cNome < 0 || cQtd < 0 || cUn < 0) throw new Error("A planilha precisa possuir Nome, Quantidade e Unidade.");
        const importados = linhas.slice(indiceCabecalho + 1).map((linha, index) => ({
          id: Date.now() + Math.random(),
          numero: cItem >= 0 ? Number(linha[cItem]) || index + 1 : index + 1,
          descricao: String(linha[cNome] || "").trim(),
          qtd: Math.floor(extrairNumero(linha[cQtd])) || 0,
          un: String(linha[cUn] || "UN").trim(),
          valor: cValor >= 0 ? extrairNumero(linha[cValor]) : 0,
        })).filter((item) => item.descricao);
        atualizarDados({ ...dados, itens: importados });
        alert(`Planilha importada com sucesso: ${importados.length} itens.`);
      } catch (erro: any) {
        alert(`Erro ao importar: ${erro.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  };

  const totalGeral = calcularValorEstimadoItens(itens);

  return <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={importarXlsx} />
    <section>
      <label style={{ fontWeight: 600, fontSize: 16, display: "block", marginBottom: 8 }}>Objeto da Licitação: <span style={{ color: "var(--btn-danger)" }}>*</span></label>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>Descreva brevemente o objeto licitado para direcionar a geração de especificações.</p>
      <input type="text" required value={objeto} onChange={(e) => atualizarDados({ ...dados, objeto: e.target.value })} style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: objeto.trim() ? "var(--input-border)" : "var(--btn-danger)" }} />
    </section>
    <section>
      <label style={{ fontWeight: 600, fontSize: 16, display: "block", marginBottom: 8 }}>Justificativa da Demanda: <span style={{ color: "var(--btn-danger)" }}>*</span></label>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>Descreva brevemente a justificativa da demanda.</p>
      <textarea required value={necessidade} onChange={(e) => atualizarDados({ ...dados, necessidade: e.target.value })} style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: necessidade.trim() ? "var(--input-border)" : "var(--btn-danger)", minHeight: 120, resize: "vertical" }} />
    </section>
    <section style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={adicionarItem} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>+ Novo Item</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>Importar XLSX</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 930 }}>
          <div style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)", display: "flex", padding: 12, borderRadius: "var(--radius)", fontWeight: 600, fontSize: 13 }}>
            <div style={{ width: 40 }}>#</div><div style={{ flex: 1, minWidth: 300 }}>Descrição</div><div style={{ width: 60 }}>UN</div><div style={{ width: 80 }}>Qtd</div><div style={{ width: 130 }}>Vlr Unit.</div><div style={{ width: 130 }}>Total</div><div style={{ width: 120 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {itens.map((item: any, index: number) => {
              const carregando = itemEmMelhoria === item.id;
              const descricao = String(item.descricao || "");
              return <div key={item.id} style={{ display: "flex", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: "var(--radius)", gap: 8 }}>
                <div style={{ width: 40, fontWeight: 600 }}>{item.numero || index + 1}</div>
                <div style={{ flex: 1, minWidth: 300, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="text" required value={descricao} onChange={(e) => atualizarItem(item.id, "descricao", e.target.value)} style={{ flex: 1, minWidth: 180, padding: 8, borderColor: descricao.trim() ? "var(--input-border)" : "var(--btn-danger)" }} />
                  <button type="button" onClick={() => melhorarItem(item)} disabled={carregando || !descricao.trim()} title="Melhorar descrição deste item com IA" aria-label={`Melhorar descrição do item ${item.numero || index + 1} com IA`} style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-panel)", color: "var(--text-main)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{carregando ? "..." : "✨ IA"}</button>
                </div>
                <input type="text" required value={item.un} onChange={(e) => atualizarItem(item.id, "un", e.target.value)} style={{ width: 60, padding: 8, textAlign: "center" }} />
                <input type="number" required min="1" step="1" value={item.qtd} onChange={(e) => atualizarItem(item.id, "qtd", parseInt(e.target.value, 10) || "")} style={{ width: 80, padding: 8, textAlign: "right" }} />
                <input type="text" required value={formatarMoeda(Number(item.valor || 0))} onChange={(e) => atualizarItem(item.id, "valor", parseMoeda(e.target.value))} style={{ width: 130, padding: 8, textAlign: "right", fontFamily: "monospace" }} />
                <div style={{ width: 130, textAlign: "right", fontWeight: 600 }}>{formatarMoeda(Number(item.qtd || 0) * Number(item.valor || 0))}</div>
                <div style={{ width: 120, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => moverItem(index, -1)} style={{ width: 28, height: 28 }}>↑</button><button type="button" onClick={() => moverItem(index, 1)} style={{ width: 28, height: 28 }}>↓</button><button type="button" onClick={() => removerItem(item.id)} style={{ width: 28, height: 28, background: "var(--btn-danger)", color: "var(--bg-panel)", border: 0 }}>X</button>
                </div>
              </div>;
            })}
            {itens.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>Nenhum item adicionado.</div>}
          </div>
          <div style={{ textAlign: "right", marginTop: 16, fontSize: 18, fontWeight: 600 }}>TOTAL GERAL: {formatarMoeda(totalGeral)}</div>
        </div>
      </div>
    </section>
  </div>;
}
