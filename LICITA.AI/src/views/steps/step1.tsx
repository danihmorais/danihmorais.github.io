import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { calcularValorEstimadoItens } from "../../utils/regrasContratacao";
import { melhorarDescricaoItem } from "../../providers/services/descricaoItensIA";
import { extrairObjetoCotacaoPdf, parseRelatorioCotacaoPdf } from "../../utils/cotacaoPdf";
// @ts-expect-error O pacote expõe o PDF.js como default em runtime, embora os tipos declarem exports nomeados.
import pdfjs from "@bundled-es-modules/pdfjs-dist/build/pdf.js";
import pdfWorkerUrl from "@bundled-es-modules/pdfjs-dist/build/pdf.worker.js?url";

export default function Step1({ dados = { itens: [], objeto: "", necessidade: "" }, atualizarDados }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [importandoPdf, setImportandoPdf] = useState(false);
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
    const apiKey = "backend";
    const modelo = "unsloth-auto";
    setItemEmMelhoria(item.id);
    try {
      const melhoria = await melhorarDescricaoItem(
        String(item.descricao),
        String(item.un || ""),
        objeto,
        necessidade,
        apiKey,
        modelo,
      );
      atualizarDados({
        ...dados,
        itens: itens.map((itemAtual: any) =>
          itemAtual.id === item.id
            ? { ...itemAtual, descricao: melhoria.descricao, un: melhoria.unidade }
            : itemAtual
        ),
      });
    } catch (erro: any) {
      console.error("Erro ao melhorar descrição:", erro);
      alert(erro?.message || "Não foi possível melhorar a descrição e a unidade deste item.");
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
        const aliasesNome = ["nome", "descrição", "descricao", "item", "produto", "objeto"];
        const aliasesQtd = ["quantidade", "qtd", "qtde", "quant.", "quant"];
        const aliasesUn = ["unidade", "un", "und", "u.m.", "um", "unid", "unidade de medida"];
        const aliasesItem = ["item", "nº", "no", "numero", "número", "código", "codigo"];
        const aliasesValor = ["valor unitário", "valor unitario", "valor", "preço unitário", "preco unitario", "preço", "preco", "vlr", "vlr unitário", "vlr unitario"];
        const colunaTem = (cabecalhos: string[], aliases: string[]) => aliases.some((alias) => cabecalhos.includes(normalizar(alias)));
        const indiceCabecalho = linhas.findIndex((linha) => {
          const cabecalhos = linha.map(normalizar);
          return colunaTem(cabecalhos, aliasesNome) && colunaTem(cabecalhos, aliasesQtd) && colunaTem(cabecalhos, aliasesUn);
        });
        if (indiceCabecalho < 0) {
          throw new Error("Cabeçalho não encontrado. A planilha deve possuir colunas de descrição/nome, quantidade e unidade.");
        }
        const cabecalhos = linhas[indiceCabecalho].map(normalizar);
        const coluna = (nomes: string[]) => nomes.map(normalizar).map((nome) => cabecalhos.indexOf(nome)).find((i) => i >= 0) ?? -1;
        const cItem = coluna(aliasesItem);
        const cNome = coluna(aliasesNome);
        const cQtd = coluna(aliasesQtd);
        const cUn = coluna(aliasesUn);
        const cValor = coluna(aliasesValor);
        if (cNome < 0 || cQtd < 0 || cUn < 0) throw new Error("A planilha precisa possuir descrição/nome, quantidade e unidade.");
        const importados = linhas.slice(indiceCabecalho + 1).map((linha, index) => ({
          id: Date.now() + Math.random(),
          numero: cItem >= 0 ? Number(linha[cItem]) || index + 1 : index + 1,
          descricao: String(linha[cNome] || "").trim(),
          qtd: extrairNumero(linha[cQtd]) || 0,
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

  const importarPdf = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setImportandoPdf(true);
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const dadosPdf = new Uint8Array(await arquivo.arrayBuffer());
      const documento = await pdfjs.getDocument({ data: dadosPdf }).promise;
      const linhas: string[] = [];

      try {
        for (let pagina = 1; pagina <= documento.numPages; pagina += 1) {
          const page = await documento.getPage(pagina);
          const conteudo = await page.getTextContent();
          const itensTexto = (conteudo.items || []).filter((item: any) => typeof item?.str === "string") as any[];

          const grupos: { y: number; itens: { x: number; str: string }[] }[] = [];
          for (const item of itensTexto) {
            const x = Number(item.transform?.[4] || 0);
            const y = Number(item.transform?.[5] || 0);
            let grupo = grupos.find((atual) => Math.abs(atual.y - y) <= 2.5);
            if (!grupo) {
              grupo = { y, itens: [] };
              grupos.push(grupo);
            }
            grupo.itens.push({ x, str: item.str });
          }

          grupos
            .sort((a, b) => b.y - a.y)
            .forEach((grupo) => {
              const linha = grupo.itens
                .sort((a, b) => a.x - b.x)
                .map((item) => item.str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              if (linha) linhas.push(linha);
            });
        }
      } finally {
        await documento.destroy();
      }

      const texto = linhas.join("\n");
      const importados = parseRelatorioCotacaoPdf(texto);
      const objetoPdf = extrairObjetoCotacaoPdf(texto);
      const objetoAtual = String(dados.objeto || "").trim();

      atualizarDados({
        ...dados,
        itens: importados.map((item) => ({
          ...item,
          id: Date.now() + Math.random(),
        })),
        ...(objetoAtual ? {} : (objetoPdf ? { objeto: objetoPdf } : {})),
      });

      alert(`Cotação PDF importada com sucesso: ${importados.length} itens.`);
    } catch (erro: any) {
      console.error("Erro ao importar cotação PDF:", erro);
      alert(`Erro ao importar cotação PDF: ${erro?.message || "arquivo inválido"}`);
    } finally {
      setImportandoPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const totalGeral = calcularValorEstimadoItens(itens);

  return <div className="step-form step-form--items" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={importarXlsx} />
    <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={importarPdf} />
    <section className="step-section item-intro-section">
      <label style={{ fontWeight: 600, fontSize: 16, display: "block", marginBottom: 8 }}>Objeto da Licitação: <span style={{ color: "var(--btn-danger)" }}>*</span></label>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>Descreva brevemente o objeto licitado para direcionar a geração de especificações.</p>
      <textarea
        required
        rows={1}
        value={objeto}
        onChange={(e) => atualizarDados({ ...dados, objeto: e.target.value })}
        style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: objeto.trim() ? "var(--input-border)" : "var(--btn-danger)", resize: "none" }}
      />
    </section>
    <section className="step-section item-intro-section">
      <label style={{ fontWeight: 600, fontSize: 16, display: "block", marginBottom: 8 }}>Justificativa da Demanda: <span style={{ color: "var(--btn-danger)" }}>*</span></label>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>Descreva brevemente a justificativa da demanda.</p>
      <textarea required value={necessidade} onChange={(e) => atualizarDados({ ...dados, necessidade: e.target.value })} style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: necessidade.trim() ? "var(--input-border)" : "var(--btn-danger)", minHeight: 120, resize: "vertical" }} />
    </section>
    <section className="step-section items-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div className="items-toolbar" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button type="button" className="item-action-primary" onClick={adicionarItem} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>+ Novo Item</button>
        <button type="button" className="item-action-secondary" onClick={() => fileInputRef.current?.click()} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>Importar XLSX</button>
        <button type="button" className="item-action-secondary" onClick={() => pdfInputRef.current?.click()} disabled={importandoPdf} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)", opacity: importandoPdf ? 0.7 : 1 }}>{importandoPdf ? "Lendo PDF..." : "Importar Cotação PDF"}</button>
      </div>
      <div className="items-table-scroll" style={{ overflowX: "auto" }}>
        <div className="items-table" style={{ minWidth: 930 }}>
          <div className="items-table-head" style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)", display: "flex", padding: 12, borderRadius: "var(--radius)", fontWeight: 600, fontSize: 13 }}>
            <div style={{ width: 40 }}>#</div><div style={{ flex: 1, minWidth: 300 }}>Descrição</div><div style={{ width: 60 }}>UN</div><div style={{ width: 80 }}>Qtd</div><div style={{ width: 130 }}>Vlr Unit.</div><div style={{ width: 130 }}>Total</div><div style={{ width: 120 }} />
          </div>
          <div className="items-table-body" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {itens.map((item: any, index: number) => {
              const carregando = itemEmMelhoria === item.id;
              const descricao = String(item.descricao || "");
              return <div key={item.id} className="item-row" style={{ display: "flex", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: "var(--radius)", gap: 8 }}>
                <div style={{ width: 40, fontWeight: 600 }}>{item.numero || index + 1}</div>
                <div className="item-description-cell" style={{ flex: 1, minWidth: 300, display: "flex", gap: 6, alignItems: "center" }}>
                  <textarea
                    required
                    rows={1}
                    value={descricao}
                    onChange={(e) => atualizarItem(item.id, "descricao", e.target.value)}
                    style={{ flex: 1, minWidth: 180, padding: 8, borderColor: descricao.trim() ? "var(--input-border)" : "var(--btn-danger)", resize: "none" }}
                  />
                  <button type="button" onClick={() => melhorarItem(item)} disabled={carregando || !descricao.trim()} title="Melhorar descrição e unidade deste item com IA" aria-label={`Melhorar descrição e unidade do item ${item.numero || index + 1} com IA`} style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-panel)", color: "var(--text-main)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{carregando ? "..." : "✨ IA"}</button>
                </div>
                <input type="text" required value={item.un} onChange={(e) => atualizarItem(item.id, "un", e.target.value)} style={{ width: 60, padding: 8, textAlign: "center" }} />
                <input type="number" required min="0.0001" step="any" value={item.qtd} onChange={(e) => atualizarItem(item.id, "qtd", parseFloat(e.target.value) || "")} style={{ width: 80, padding: 8, textAlign: "right" }} />
                <input type="text" required value={formatarMoeda(Number(item.valor || 0))} onChange={(e) => atualizarItem(item.id, "valor", parseMoeda(e.target.value))} style={{ width: 130, padding: 8, textAlign: "right", fontFamily: "monospace" }} />
                <div style={{ width: 130, textAlign: "right", fontWeight: 600 }}>{formatarMoeda(Number(item.qtd || 0) * Number(item.valor || 0))}</div>
                <div style={{ width: 120, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => moverItem(index, -1)} style={{ width: 28, height: 28 }}>↑</button><button type="button" onClick={() => moverItem(index, 1)} style={{ width: 28, height: 28 }}>↓</button><button type="button" onClick={() => removerItem(item.id)} style={{ width: 28, height: 28, background: "var(--btn-danger)", color: "var(--bg-panel)", border: 0 }}>X</button>
                </div>
              </div>;
            })}
            {itens.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>Nenhum item adicionado.</div>}
          </div>
          <div className="items-total"> <span>Total estimado</span><strong>{formatarMoeda(totalGeral)}</strong></div>
        </div>
      </div>
    </section>
  </div>;
}
