import React, { useRef, useState } from "react";
import { useToast } from "../../components/toast";
import ConfirmDialog from "../../components/ConfirmDialog";

import { calcularValorEstimadoItens } from "../../utils/regrasContratacao";
import { melhorarDescricaoItem } from "../../providers/services/descricaoItensIA";
import { extrairObjetoCotacaoPdf, parseRelatorioCotacaoPdf } from "../../utils/cotacaoPdf";
import { obterLotes, obterLoteIdItem } from "../../utils/lotes";

export default function Step1({ dados = { itens: [], objeto: "", necessidade: "" }, atualizarDados, tentouAvancar = false }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [importandoXlsx, setImportandoXlsx] = useState(false);
  const [itemEmMelhoria, setItemEmMelhoria] = useState<number | string | null>(null);
  const [importacaoPendente, setImportacaoPendente] = useState<any[] | null>(null);
  const [loteEmEdicao, setLoteEmEdicao] = useState<any | null>(null);
  const [loteParaExcluir, setLoteParaExcluir] = useState<any | null>(null);
  const { showToast } = useToast();
  const itens = dados.itens || [];
  const lotes = obterLotes(dados);
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

  const iniciarNovoLote = () => {
    if (loteEmEdicao) return;
    const rascunho = {
      id: `lote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nome: `Lote ${lotes.length + 1}`,
      novo: true,
    };
    setLoteEmEdicao(rascunho);
  };

  const iniciarEdicaoLote = (lote: any) => setLoteEmEdicao({ id: lote.id, nome: lote.nome, novo: false });

  const salvarLote = () => {
    if (!loteEmEdicao) return;
    const nome = String(loteEmEdicao.nome || "").trim();
    if (!nome) {
      showToast("Informe um nome para o lote.", "error");
      return;
    }
    const duplicado = lotes.some((lote: any) =>
      lote.id !== loteEmEdicao.id && normalizar(lote.nome) === normalizar(nome)
    );
    if (duplicado) {
      showToast("Já existe um lote com esse nome. Use um nome diferente.", "error");
      return;
    }

    atualizarDados((anterior: any) => {
      const lotesAnteriores = obterLotes(anterior);
      const novosLotes = loteEmEdicao.novo
        ? [...lotesAnteriores, { id: loteEmEdicao.id, nome }]
        : lotesAnteriores.map((lote: any) => lote.id === loteEmEdicao.id ? { ...lote, nome } : lote);
      const itensAtualizados = (anterior.itens || []).map((item: any) => {
        if (loteEmEdicao.novo || obterLoteIdItem(item, lotesAnteriores) !== loteEmEdicao.id) return item;
        return { ...item, loteId: loteEmEdicao.id, lote: nome };
      });
      return { lotes: novosLotes, itens: itensAtualizados, criterio: "LOTE" };
    });
    setLoteEmEdicao(null);
    showToast(loteEmEdicao.novo ? "Lote criado. Agora distribua os itens entre os lotes." : "Lote atualizado.", "success");
  };

  const cancelarEdicaoLote = () => setLoteEmEdicao(null);

  const excluirLote = () => {
    if (!loteParaExcluir) return;
    const removido = loteParaExcluir;
    atualizarDados((anterior: any) => {
      const lotesAnteriores = obterLotes(anterior);
      const lotesRestantes = lotesAnteriores.filter((lote: any) => lote.id !== removido.id);
      const itensAtualizados = (anterior.itens || []).map((item: any) => {
        if (obterLoteIdItem(item, lotesAnteriores) !== removido.id) return item;
        const { loteId: _loteId, lote: _lote, ...itemSemLote } = item;
        return itemSemLote;
      });
      const haviaCriterioLote = anterior.criterio === "LOTE";
      return {
        lotes: lotesRestantes,
        itens: itensAtualizados,
        criterio: lotesRestantes.length ? "LOTE" : (haviaCriterioLote ? "ITEM" : anterior.criterio),
        motivoCriterio: lotesRestantes.length || !haviaCriterioLote ? anterior.motivoCriterio : "",
      };
    });
    if (loteEmEdicao?.id === removido.id) setLoteEmEdicao(null);
    setLoteParaExcluir(null);
    showToast("Lote excluído. Confira a distribuição dos itens restantes.", "info");
  };

  const atribuirItemALote = (itemId: any, loteId: string) => {
    atualizarDados((anterior: any) => {
      const lotesAtuais = obterLotes(anterior);
      const loteSelecionado = lotesAtuais.find((lote: any) => lote.id === loteId);
      const itensAtualizados = (anterior.itens || []).map((item: any) => {
        if (item.id !== itemId) return item;
        if (!loteSelecionado) {
          const { loteId: _loteId, lote: _lote, ...itemSemLote } = item;
          return itemSemLote;
        }
        return { ...item, loteId: loteSelecionado.id, lote: loteSelecionado.nome };
      });
      return { itens: itensAtualizados, ...(lotesAtuais.length ? { criterio: "LOTE" } : {}) };
    });
  };

  const dadosLote = (lote: any, lotesDisponiveis = lotes) => {
    const itensDoLote = itens.filter((item: any) => obterLoteIdItem(item, lotesDisponiveis) === lote.id);
    return {
      quantidade: itensDoLote.length,
      total: calcularValorEstimadoItens(itensDoLote),
    };
  };

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

  const aplicarImportacaoItens = (importados: any[], anexar: boolean) => {
    const atuais = itensRef.current;
    const resultado = anexar ? [...atuais, ...importados] : importados;
    atualizarDados((anterior: any) => ({ itens: renumerarItens(resultado) }));
    setImportacaoPendente(null);
    showToast(
      `${importados.length} itens ${anexar ? "acrescentados ao final" : "importados"}; total atual: ${resultado.length}.`,
      "success"
    );
  };

  const decidirImportacaoItens = (importados: any[]) => {
    if (itensRef.current.length > 0) {
      setImportacaoPendente(importados);
      return;
    }
    aplicarImportacaoItens(importados, false);
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
        decidirImportacaoItens(importados);
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
      decidirImportacaoItens(itensImportados);
      if (!objetoAtual && objetoPdf) atualizarDados((anterior: any) => ({ objeto: anterior.objeto?.trim() ? anterior.objeto : objetoPdf }));
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
    <section className="step-section lots-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, background: "var(--bg-panel)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <h2 style={{ margin: 0, color: "var(--text-main)", fontSize: 17, fontWeight: 650 }}>Organização por lotes</h2>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
            Agrupe itens relacionados. Ao criar pelo menos um lote, o critério de julgamento passa automaticamente para menor preço por lote.
          </p>
        </div>
        <button type="button" onClick={iniciarNovoLote} disabled={Boolean(loteEmEdicao)} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "10px 14px", background: "var(--btn-primary)", color: "var(--bg-panel)", fontWeight: 600, cursor: loteEmEdicao ? "not-allowed" : "pointer", opacity: loteEmEdicao ? 0.55 : 1, whiteSpace: "nowrap" }}>
          + Criar lote
        </button>
      </div>

      {lotes.length === 0 && !loteEmEdicao?.novo && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: "var(--radius)", background: "var(--bg-subtle)", border: "1px dashed var(--border)" }}>
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>▦</span>
          <div>
            <strong style={{ display: "block", color: "var(--text-main)", fontSize: 14 }}>Nenhum lote criado</strong>
            <span style={{ display: "block", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>A contratação continuará organizada por item ou global. Crie lotes apenas quando houver justificativa para reunir itens em grupos.</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        {[...lotes, ...(loteEmEdicao?.novo ? [loteEmEdicao] : [])].map((lote: any, index: number) => {
          const emEdicao = loteEmEdicao?.id === lote.id;
          const resumo = dadosLote(lote, lotes);
          return <article key={lote.id} style={{ border: emEdicao ? "1px solid var(--btn-primary)" : "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, background: "var(--bg-panel)", boxShadow: emEdicao ? "0 0 0 2px color-mix(in srgb, var(--btn-primary) 12%, transparent)" : "none", minWidth: 0 }}>
            {emEdicao ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-muted)", padding: "5px 8px", fontSize: 11, fontWeight: 700 }}>LOTE {index + 1}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{loteEmEdicao.novo ? "Novo grupo" : "Editando grupo"}</span>
                </div>
                <label style={{ display: "block", color: "var(--text-main)", fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor={`nome-lote-${lote.id}`}>Nome do lote</label>
                <input id={`nome-lote-${lote.id}`} autoFocus value={loteEmEdicao.nome} maxLength={100} onChange={(e) => setLoteEmEdicao((atual: any) => ({ ...atual, nome: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarLote(); } if (e.key === "Escape") cancelarEdicaoLote(); }} placeholder="Ex.: Materiais de expediente" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--input-border)", background: "var(--bg-subtle)", color: "var(--text-main)" }} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  <button type="button" onClick={cancelarEdicaoLote} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 11px", background: "transparent", color: "var(--text-main)" }}>Cancelar</button>
                  <button type="button" onClick={salvarLote} style={{ border: 0, borderRadius: "var(--radius)", padding: "8px 12px", background: "var(--btn-primary)", color: "var(--bg-panel)", fontWeight: 600 }}>Salvar lote</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: "inline-block", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>LOTE {index + 1}</span>
                    <h3 style={{ margin: 0, color: "var(--text-main)", fontSize: 15, overflowWrap: "anywhere" }}>{lote.nome}</h3>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button type="button" aria-label={`Editar ${lote.nome}`} onClick={() => iniciarEdicaoLote(lote)} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 9px", background: "var(--bg-subtle)", color: "var(--text-main)", fontSize: 12 }}>Editar</button>
                    <button type="button" aria-label={`Excluir ${lote.nome}`} onClick={() => setLoteParaExcluir(lote)} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 9px", background: "transparent", color: "var(--btn-danger)", fontSize: 12 }}>Excluir</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  <span style={{ borderRadius: 999, background: "var(--bg-subtle)", padding: "5px 9px", color: "var(--text-muted)", fontSize: 12 }}>{resumo.quantidade} {resumo.quantidade === 1 ? "item" : "itens"}</span>
                  <span style={{ borderRadius: 999, background: "var(--bg-subtle)", padding: "5px 9px", color: "var(--text-main)", fontSize: 12, fontWeight: 600 }}>{formatarMoeda(resumo.total)}</span>
                </div>
                {resumo.quantidade === 0 && <p style={{ margin: "12px 0 0", color: "var(--btn-danger)", fontSize: 12 }}>Atribua pelo menos um item a este lote.</p>}
              </>
            )}
          </article>;
        })}
      </div>

      {lotes.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: "var(--radius)", background: "var(--bg-subtle)", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
          Distribua todos os itens usando o campo <strong>Lote</strong> na lista abaixo. Para avançar, cada item deve pertencer a um lote existente e nenhum lote pode ficar vazio.
        </div>
      )}
    </section>

    <section className="step-section items-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div className="items-toolbar" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button type="button" className="item-action-primary" onClick={adicionarItem} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)" }}>+ Novo Item</button>
        <button type="button" className="item-action-secondary" onClick={() => fileInputRef.current?.click()} disabled={importandoXlsx || importandoPdf} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)", opacity: importandoXlsx || importandoPdf ? 0.7 : 1 }}>{importandoXlsx ? "Lendo XLSX..." : "Importar XLSX"}</button>
        <button type="button" className="item-action-secondary" onClick={() => pdfInputRef.current?.click()} disabled={importandoPdf} style={{ height: 38, padding: "0 16px", background: "var(--btn-primary)", color: "var(--bg-panel)", border: 0, borderRadius: "var(--radius-lg)", opacity: importandoPdf ? 0.7 : 1 }}>{importandoPdf ? "Lendo PDF..." : "Importar Cotação PDF"}</button>
      </div>
      <div className="items-table-scroll" style={{ overflowX: "auto" }}>
        <div className="items-table" style={{ minWidth: lotes.length ? 1090 : 930 }}>
          <div className="items-table-head" style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)", display: "flex", padding: 12, borderRadius: "var(--radius)", fontWeight: 600, fontSize: 13 }}>
            <div style={{ width: 40 }}>#</div><div style={{ flex: 1, minWidth: 260 }}>Descrição</div>{lotes.length > 0 && <div style={{ width: 160 }}>Lote</div>}<div style={{ width: 60 }}>UN</div><div style={{ width: 80 }}>Qtd</div><div style={{ width: 130 }}>Vlr Unit.</div><div style={{ width: 130 }}>Total</div><div style={{ width: 120 }} />
          </div>
          <div className="items-table-body" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {itens.map((item: any, index: number) => {
              const carregando = itemEmMelhoria === item.id;
              const descricao = String(item.descricao || "");
              const erroDescricao = tentouAvancar && !descricao.trim();
              return <div key={item.id} className="item-row" style={{ display: "flex", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: "var(--radius)", gap: 8 }}>
                <div className="item-number" style={{ width: 40, fontWeight: 600 }}>{item.numero || index + 1}</div>
                <div className="item-description-cell" style={{ flex: 1, minWidth: 260, display: "flex", gap: 6, alignItems: "center" }}>
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
                {lotes.length > 0 && <label className="item-field item-field-lot" style={{ display: "flex", flexDirection: "column", gap: 4, width: 160, flexShrink: 0 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Lote</span>
                  <select aria-label={`Lote do item ${item.numero || index + 1}`} value={obterLoteIdItem(item, lotes)} onChange={(e) => atribuirItemALote(item.id, e.target.value)} style={{ width: "100%", minWidth: 0, padding: 8, borderRadius: "var(--radius)", border: "1px solid var(--input-border)", background: "var(--bg-panel)", color: "var(--text-main)" }}>
                    <option value="">Selecione um lote</option>
                    {lotes.map((lote: any) => <option key={lote.id} value={lote.id}>{lote.nome}</option>)}
                  </select>
                </label>}
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
    {loteParaExcluir && (
      <ConfirmDialog
        title={`Excluir "${loteParaExcluir.nome}"?`}
        message="Os itens vinculados a este lote ficarão sem lote e precisarão ser redistribuídos. Se este for o último lote, o critério poderá voltar a ser por item ou global."
        confirmLabel="Excluir lote"
        cancelLabel="Manter lote"
        variant="danger"
        onConfirm={excluirLote}
        onDismiss={() => setLoteParaExcluir(null)}
      />
    )}
    {importacaoPendente && (
      <ConfirmDialog
        title="Como deseja importar os itens?"
        message="Já existem itens no formulário. Você pode substituir a lista atual ou acrescentar os itens importados ao final."
        confirmLabel="Substituir lista atual"
        cancelLabel="Acrescentar ao final"
        variant="danger"
        onConfirm={() => aplicarImportacaoItens(importacaoPendente, false)}
        onCancel={() => aplicarImportacaoItens(importacaoPendente, true)}
        onDismiss={() => setImportacaoPendente(null)}
      />
    )}
  </div>;
}
