import React, { useRef, useState } from "react";
import { useToast } from "../../components/toast";

import { calcularValorEstimadoItens } from "../../utils/regrasContratacao";
import { melhorarDescricaoItem } from "../../providers/services/descricaoItensIA";
import { extrairObjetoCotacaoPdf, parseRelatorioCotacaoPdf } from "../../utils/cotacaoPdf";

export default function Step1({ dados = { itens: [], objeto: "", necessidade: "" }, atualizarDados, tentouAvancar = false }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [importandoXlsx, setImportandoXlsx] = useState(false);
  const [itemEmMelhoria, setItemEmMelhoria] = useState<number | string | null>(null);
  const { showToast } = useToast();
  const itens = dados.itens || [];
  const itensRef = useRef<any[]>(itens);
  itensRef.current = itens;
  const objeto = dados.objeto || "";
  const necessidade = dados.necessidade || "";
  const erroObjeto = tentouAvancar && !String(objeto).trim();
  const erroNecessidade = tentouAvancar && !String(necessidade).trim();

  const formatarMoeda = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const parseMoeda = (texto: string) => Number(String(texto).replace(/[^\d]/g, "")) / 100;
  const extrairNumero = (valor: any) => {
    if (typeof valor === "number") return valor;
    const texto = String(valor || "0").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    return Number(texto) || 0;
  };
  const normalizar = (valor: any) => String(valor || "").trim().toLowerCase();

  const renumerarItens = (lista: any[]) => lista.map((item, index) => ({ ...item, numero: index + 1 }));

  const atualizarItem = (id: any, campo: string, valor: any) => {
    atualizarDados((anterior: any) => ({
      itens: (anterior.itens || []).map((item: any) => item.id === id ? { ...item, [campo]: valor } : item),
    }));
  };

  const adicionarItem = () => atualizarDados((anterior: any) => {
    const atuais = anterior.itens || [];
    return { itens: [...atuais, { id: Date.now() + Math.random(), numero: atuais.length + 1, descricao: "", un: "UN", qtd: 1, valor: 0 }] };
  });

  const removerItem = (id: any) => atualizarDados((anterior: any) => ({
    itens: renumerarItens((anterior.itens || []).filter((item: any) => item.id !== id)),
  }));

  const moverItem = (index: number, direcao: number) => atualizarDados((anterior: any) => {
    const novosItens = [...(anterior.itens || [])];
    const novoIndex = index + direcao;
    if (novoIndex < 0 || novoIndex >= novosItens.length) return {};
    [novosItens[index], novosItens[novoIndex]] = [novosItens[novoIndex], novosItens[index]];
    return { itens: renumerarItens(novosItens) };
  });

  const decidirImportacaoItens = (importados: any[]) => {
    const atuais = itensRef.current;
    const anexar = atuais.length > 0 && !window.confirm(
      "Já existem itens no formulário. OK = substituir a lista atual pelos itens importados. Cancelar = acrescentar os itens importados ao final."
    );
    const resultado = anexar ? [...atuais, ...importados] : importados;
    atualizarDados((anterior: any) => ({ itens: renumerarItens(resultado) }));
    return { quantidade: importados.length, anexados: anexar, total: resultado.length };
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
      atualizarDados((anterior: any) => ({
        itens: (anterior.itens || []).map((itemAtual: any) =>
          itemAtual.id === item.id
            ? { ...itemAtual, descricao: melhoria.descricao, un: melhoria.unidade }
            : itemAtual
        ),
      }));
    } catch (erro: any) {
      console.error("Erro ao melhorar descrição:", erro);
      showToast(erro?.message || "Não foi possível melhorar a descrição e a unidade deste item.", "error");
    } finally {
      setItemEmMelhoria(null);
    }
  };

  const importarXlsx = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setImportandoXlsx(true);
    const leitor = new FileReader();
    leitor.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        const aliasesNome = ["nome", "descrição", "descricao", "item", "produto", "objeto"];
        const aliasesQtd = ["quantidade", "qtd", "qtde", "quant.", "quant"];
        const aliasesUn = ["unidade", "un", "und", "u.m.", "um", "unid", "unidade de medida"];
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
        const cNome = coluna(aliasesNome);
        const cQtd = coluna(aliasesQtd);
        const cUn = coluna(aliasesUn);
        const cValor = coluna(aliasesValor);
        if (cNome < 0 || cQtd < 0 || cUn < 0) throw new Error("A planilha precisa possuir descrição/nome, quantidade e unidade.");
        const importados = linhas.slice(indiceCabecalho + 1).map((linha, index) => ({
          id: Date.now() + Math.random() + index,
          numero: index + 1,
          descricao: String(linha[cNome] || "").trim(),
          qtd: extrairNumero(linha[cQtd]) || 0,
          un: String(linha[cUn] || "UN").trim(),
          valor: cValor >= 0 ? extrairNumero(linha[cValor]) : 0,
        })).filter((item) => item.descricao);
        const acao = decidirImportacaoItens(importados);
        showToast(`Planilha importada: ${importados.length} itens ${acao.anexados ? "acrescentados" : "importados"}; total atual: ${acao.total}.`, "success");
      } catch (erro: any) {
        showToast(`Erro ao importar: ${erro.message}`, "error");
      } finally {
        setImportandoXlsx(false);
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
      const [pdfModule, workerModule] = await Promise.all([
        import("@bundled-es-modules/pdfjs-dist/build/pdf.js"),
        import("@bundled-es-modules/pdfjs-dist/build/pdf.worker.js?url"),
      ]);
      const pdfjs: any = (pdfModule as any).default || pdfModule;
      const pdfWorkerUrl: string = (workerModule as any).default || String(workerModule);
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

      const itensImportados = importados.map((item, index) => ({
        ...item,
        numero: index + 1,
        id: Date.now() + Math.random() + index,
      }));
      const acao = decidirImportacaoItens(itensImportados);
      if (!objetoAtual && objetoPdf) atualizarDados((anterior: any) => ({ objeto: anterior.objeto?.trim() ? anterior.objeto : objetoPdf }));
      showToast(`Cotação PDF: ${importados.length} itens ${acao.anexados ? "acrescentados" : "importados"}; total atual: ${acao.total}.`, "success");
    } catch (erro: any) {
      console.error("Erro ao importar cotação PDF:", erro);
      showToast(`Erro ao importar cotação PDF: ${erro?.message || "arquivo inválido"}`, "error");
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
        onChange={(e) => atualizarDados((anterior: any) => ({ objeto: e.target.value }))}
        aria-invalid={erroObjeto || undefined}
        aria-describedby={erroObjeto ? "erro-objeto" : undefined}
        style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: erroObjeto ? "var(--btn-danger)" : "var(--input-border)", resize: "none" }}
      />
      {erroObjeto && <small id="erro-objeto" className="wizard-field-error">Informe o objeto da contratação.</small>}
    </section>
    <section className="step-section item-intro-section">
      <label style={{ fontWeight: 600, fontSize: 16, display: "block", marginBottom: 8 }}>Justificativa da Demanda: <span style={{ color: "var(--btn-danger)" }}>*</span></label>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>Descreva brevemente a justificativa da demanda.</p>
      <textarea required value={necessidade} onChange={(e) => atualizarDados((anterior: any) => ({ necessidade: e.target.value }))} aria-invalid={erroNecessidade || undefined}
      aria-describedby={erroNecessidade ? "erro-necessidade" : undefined}
      style={{ padding: 12, borderRadius: "var(--radius-lg)", borderColor: erroNecessidade ? "var(--btn-danger)" : "var(--input-border)", minHeight: 120, resize: "vertical" }} />
      {erroNecessidade && <small id="erro-necessidade" className="wizard-field-error">Informe a justificativa da demanda.</small>}
    </section>
    <section className="step-section items-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div className="items-toolbar" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button type="button" className="item-action-primary" onClick={adicionarItem} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>+ Novo Item</button>
        <button type="button" className="item-action-secondary" onClick={() => fileInputRef.current?.click()} disabled={importandoXlsx || importandoPdf} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)", opacity: importandoXlsx || importandoPdf ? 0.7 : 1 }}>{importandoXlsx ? "Lendo XLSX..." : "Importar XLSX"}</button>
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
              const erroDescricao = tentouAvancar && !descricao.trim();
              return <div key={item.id} className="item-row" style={{ display: "flex", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: "var(--radius)", gap: 8 }}>
                <div className="item-number" style={{ width: 40, fontWeight: 600 }}>{item.numero || index + 1}</div>
                <div className="item-description-cell" style={{ flex: 1, minWidth: 300, display: "flex", gap: 6, alignItems: "center" }}>
                  <textarea
                    required
                    rows={1}
                    value={descricao}
                    onChange={(e) => atualizarItem(item.id, "descricao", e.target.value)}
                    disabled={carregando}
                    aria-invalid={erroDescricao || undefined}
                    style={{ flex: 1, minWidth: 180, padding: 8, borderColor: erroDescricao ? "var(--btn-danger)" : "var(--input-border)", resize: "none" }}
                  />
                  <button type="button" onClick={() => melhorarItem(item)} disabled={carregando || !descricao.trim()} title="Melhorar descrição e unidade deste item com IA" aria-label={`Melhorar descrição e unidade do item ${item.numero || index + 1} com IA`} style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-panel)", color: "var(--text-main)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{carregando ? "..." : "✨ IA"}</button>
                </div>
                <label className="item-field item-field-unit"><span>Unidade</span><input className="item-unit" type="text" required value={item.un} onChange={(e) => atualizarItem(item.id, "un", e.target.value)} disabled={carregando} style={{ width: 60, padding: 8, textAlign: "center" }} /></label>
                <label className="item-field item-field-quantity"><span>Quantidade</span><input className="item-quantity" type="number" required min="0.0001" step="any" value={item.qtd} onChange={(e) => atualizarItem(item.id, "qtd", parseFloat(e.target.value) || "")} disabled={carregando} style={{ width: 80, padding: 8, textAlign: "right" }} /></label>
                <label className="item-field item-field-price"><span>Valor unitário</span><input className="item-price" type="text" required value={formatarMoeda(Number(item.valor || 0))} onChange={(e) => atualizarItem(item.id, "valor", parseMoeda(e.target.value))} disabled={carregando} style={{ width: 130, padding: 8, textAlign: "right", fontFamily: "monospace" }} /></label>
                <div className="item-line-total" style={{ width: 130, textAlign: "right", fontWeight: 600 }}><span>Total do item</span><strong>{formatarMoeda(Number(item.qtd || 0) * Number(item.valor || 0))}</strong></div>
                <div className="item-row-actions" style={{ width: 120, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button type="button" className="item-move-button" aria-label="Mover item para cima" title="Mover para cima" onClick={() => moverItem(index, -1)} disabled={carregando} style={{ width: 28, height: 28 }}>↑</button><button type="button" className="item-move-button" aria-label="Mover item para baixo" title="Mover item para baixo" onClick={() => moverItem(index, 1)} disabled={carregando} style={{ width: 28, height: 28 }}>↓</button><button type="button" className="item-delete-button" aria-label="Remover item" title="Remover item" onClick={() => removerItem(item.id)} disabled={carregando} style={{ width: 28, height: 28, background: "var(--btn-danger)", color: "var(--bg-panel)", border: 0 }}>×</button>
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
