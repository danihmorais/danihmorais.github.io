import React, { useRef, useState } from "react";
import { useToast } from "../../components/toast";
import ConfirmDialog from "../../components/ConfirmDialog";
import { importarItensPlanilha } from "../../api";

import { calcularValorEstimadoItens } from "../../utils/regrasContratacao";
import { melhorarDescricaoItem } from "../../providers/services/descricaoItensIA";
import { extrairObjetoCotacaoPdf, parseRelatorioCotacaoPdf } from "../../utils/cotacaoPdf";
import { obterLotes, obterLoteIdItem, distribuicaoLotesValida } from "../../utils/lotes";

function ajustarAlturaDescricao(elemento: HTMLTextAreaElement | null) {
  if (!elemento) return;
  elemento.style.height = "auto";
  elemento.style.height = `${elemento.scrollHeight}px`;
}

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

  const atribuirItemALote = (itemId: any, loteId: string, itemIndex: number) => {
    atualizarDados((anterior: any) => {
      const lotesAtuais = obterLotes(anterior);
      const loteSelecionado = lotesAtuais.find((lote: any) => lote.id === loteId);
      const itensAtualizados = (anterior.itens || []).map((item: any, index: number) => {
        const corresponde = item.id !== undefined && item.id !== null ? item.id === itemId : index === itemIndex;
        if (!corresponde) return item;
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
    atualizarDados(() => ({ itens: renumerarItens(resultado) }));
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

  const importarXlsx = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setImportandoXlsx(true);
    try {
      const resposta = await importarItensPlanilha(arquivo);
      const importados = resposta.items.map((item, index) => ({
        id: Date.now() + Math.random() + index,
        numero: Number(item.numero) || index + 1,
        descricao: String(item.descricao || "").trim(),
        qtd: extrairNumero(item.qtd) || 0,
        un: String(item.un || "UN").trim(),
        valor: extrairNumero(item.valor) || 0,
      })).filter(item => item.descricao);
      if (!importados.length) throw new Error("Nenhuma linha com descrição válida foi encontrada.");
      decidirImportacaoItens(importados);
    } catch (erro: any) {
      showToast(`Erro ao importar: ${erro?.message || "arquivo inválido"}`, "error");
    } finally {
      setImportandoXlsx(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
      const documento = await pdfjs.getDocument({ data: dadosPdf, isEvalSupported: false }).promise;
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

  return <div className="step-form step-form--items licita-step1-style-001" >
    <input ref={fileInputRef} type="file" accept=".xlsx,.csv"  onChange={importarXlsx}  className={ ["licita-step1-style-002"].filter(Boolean).join(" ") }/>
    <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf"  onChange={importarPdf}  className={ ["licita-step1-style-003"].filter(Boolean).join(" ") }/>
    <section className="step-section item-intro-section">
      <label  className={ ["licita-step1-style-004"].filter(Boolean).join(" ") }>Objeto da Licitação: <span  className={ ["licita-step1-style-005"].filter(Boolean).join(" ") }>*</span></label>
      <p  className={ ["licita-step1-style-006"].filter(Boolean).join(" ") }>Descreva brevemente o objeto licitado para direcionar a geração de especificações.</p>
      <textarea
        required
        rows={1}
        value={objeto}
        onChange={(e) => atualizarDados(() => ({ objeto: e.target.value }))}
        aria-invalid={erroObjeto || undefined}
        aria-describedby={erroObjeto ? "erro-objeto" : undefined}
        
       className={ ["licita-step1-style-007", (erroObjeto ? "licita-step1-style-007-p3-a" : "licita-step1-style-007-p3-b")].filter(Boolean).join(" ") }/>
      {erroObjeto && <small id="erro-objeto" className="wizard-field-error">Informe o objeto da contratação.</small>}
    </section>
    <section className="step-section item-intro-section">
      <label  className={ ["licita-step1-style-008"].filter(Boolean).join(" ") }>Justificativa da Demanda: <span  className={ ["licita-step1-style-009"].filter(Boolean).join(" ") }>*</span></label>
      <p  className={ ["licita-step1-style-010"].filter(Boolean).join(" ") }>Descreva brevemente a justificativa da demanda.</p>
      <textarea required value={necessidade} onChange={(e) => atualizarDados(() => ({ necessidade: e.target.value }))} aria-invalid={erroNecessidade || undefined}
      aria-describedby={erroNecessidade ? "erro-necessidade" : undefined}
        className={ ["licita-step1-style-011", (erroNecessidade ? "licita-step1-style-011-p3-a" : "licita-step1-style-011-p3-b")].filter(Boolean).join(" ") }/>
      {erroNecessidade && <small id="erro-necessidade" className="wizard-field-error">Informe a justificativa da demanda.</small>}
    </section>
    <section className="step-section lots-section licita-step1-style-012" >
      <div  className={ ["licita-step1-style-013"].filter(Boolean).join(" ") }>
        <div  className={ ["licita-step1-style-014"].filter(Boolean).join(" ") }>
          <h2  className={ ["licita-step1-style-015"].filter(Boolean).join(" ") }>Organização por lotes</h2>
          <p  className={ ["licita-step1-style-016"].filter(Boolean).join(" ") }>
            Agrupe itens relacionados. Ao criar pelo menos um lote, o critério de julgamento passa automaticamente para menor preço por lote.
          </p>
        </div>
        <button type="button" onClick={iniciarNovoLote} disabled={Boolean(loteEmEdicao)}  className={ ["licita-step1-style-017", (loteEmEdicao ? "licita-step1-style-017-p7-a" : "licita-step1-style-017-p7-b"), (loteEmEdicao ? "licita-step1-style-017-p8-a" : "licita-step1-style-017-p8-b")].filter(Boolean).join(" ") }>
          + Criar lote
        </button>
      </div>

      {lotes.length === 0 && !loteEmEdicao?.novo && (
        <div  className={ ["licita-step1-style-018"].filter(Boolean).join(" ") }>
          <span aria-hidden="true"  className={ ["licita-step1-style-019"].filter(Boolean).join(" ") }>▦</span>
          <div>
            <strong  className={ ["licita-step1-style-020"].filter(Boolean).join(" ") }>Nenhum lote criado</strong>
            <span  className={ ["licita-step1-style-021"].filter(Boolean).join(" ") }>A contratação continuará organizada por item ou global. Crie lotes apenas quando houver justificativa para reunir itens em grupos.</span>
          </div>
        </div>
      )}

      <div  className={ ["licita-step1-style-022"].filter(Boolean).join(" ") }>
        {[...lotes, ...(loteEmEdicao?.novo ? [loteEmEdicao] : [])].map((lote: any, index: number) => {
          const emEdicao = loteEmEdicao?.id === lote.id;
          const resumo = dadosLote(lote, lotes);
          return <article key={lote.id}  className={ ["licita-step1-style-023", (emEdicao ? "licita-step1-style-023-p1-a" : "licita-step1-style-023-p1-b"), (emEdicao ? "licita-step1-style-023-p5-a" : "licita-step1-style-023-p5-b")].filter(Boolean).join(" ") }>
            {emEdicao ? (
              <>
                <div  className={ ["licita-step1-style-024"].filter(Boolean).join(" ") }>
                  <span  className={ ["licita-step1-style-025"].filter(Boolean).join(" ") }>LOTE {index + 1}</span>
                  <span  className={ ["licita-step1-style-026"].filter(Boolean).join(" ") }>{loteEmEdicao.novo ? "Novo grupo" : "Editando grupo"}</span>
                </div>
                <label  htmlFor={`nome-lote-${lote.id}`} className={ ["licita-step1-style-027"].filter(Boolean).join(" ") }>Nome do lote</label>
                <input id={`nome-lote-${lote.id}`} autoFocus value={loteEmEdicao.nome} maxLength={100} onChange={(e) => setLoteEmEdicao((atual: any) => ({ ...atual, nome: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarLote(); } if (e.key === "Escape") cancelarEdicaoLote(); }} placeholder="Ex.: Materiais de expediente"   className={ ["licita-step1-style-028"].filter(Boolean).join(" ") }/>
                <div  className={ ["licita-step1-style-029"].filter(Boolean).join(" ") }>
                  <button type="button" onClick={cancelarEdicaoLote}  className={ ["licita-step1-style-030"].filter(Boolean).join(" ") }>Cancelar</button>
                  <button type="button" onClick={salvarLote}  className={ ["licita-step1-style-031"].filter(Boolean).join(" ") }>Salvar lote</button>
                </div>
              </>
            ) : (
              <>
                <div  className={ ["licita-step1-style-032"].filter(Boolean).join(" ") }>
                  <div  className={ ["licita-step1-style-033"].filter(Boolean).join(" ") }>
                    <span  className={ ["licita-step1-style-034"].filter(Boolean).join(" ") }>LOTE {index + 1}</span>
                    <h3  className={ ["licita-step1-style-035"].filter(Boolean).join(" ") }>{lote.nome}</h3>
                  </div>
                  <div  className={ ["licita-step1-style-036"].filter(Boolean).join(" ") }>
                    <button type="button" aria-label={`Editar ${lote.nome}`} onClick={() => iniciarEdicaoLote(lote)}  className={ ["licita-step1-style-037"].filter(Boolean).join(" ") }>Editar</button>
                    <button type="button" aria-label={`Excluir ${lote.nome}`} onClick={() => setLoteParaExcluir(lote)}  className={ ["licita-step1-style-038"].filter(Boolean).join(" ") }>Excluir</button>
                  </div>
                </div>
                <div  className={ ["licita-step1-style-039"].filter(Boolean).join(" ") }>
                  <span  className={ ["licita-step1-style-040"].filter(Boolean).join(" ") }>{resumo.quantidade} {resumo.quantidade === 1 ? "item" : "itens"}</span>
                  <span  className={ ["licita-step1-style-041"].filter(Boolean).join(" ") }>{formatarMoeda(resumo.total)}</span>
                </div>
                {resumo.quantidade === 0 && <p  className={ ["licita-step1-style-042"].filter(Boolean).join(" ") }>Atribua pelo menos um item a este lote.</p>}
              </>
            )}
          </article>;
        })}
      </div>

      {lotes.length > 0 && (
        <div role={tentouAvancar && !distribuicaoLotesValida(dados) ? "alert" : "note"}  className={ ["licita-step1-style-043", (tentouAvancar && !distribuicaoLotesValida(dados) ? "licita-step1-style-043-p5-a" : "licita-step1-style-043-p5-b"), (tentouAvancar && !distribuicaoLotesValida(dados) ? "licita-step1-style-043-p6-a" : "licita-step1-style-043-p6-b")].filter(Boolean).join(" ") }>
          {tentouAvancar && !distribuicaoLotesValida(dados)
            ? "Distribuição incompleta: atribua cada item a um lote e verifique se todos os lotes possuem pelo menos um item."
            : <>Distribua todos os itens usando o campo <strong>Lote</strong> na lista abaixo. Para avançar, cada item deve pertencer a um lote existente e nenhum lote pode ficar vazio.</>}
        </div>
      )}
    </section>

    <section className="step-section items-section licita-step1-style-044" >
      <div className="items-toolbar licita-step1-style-045" >
        <button type="button" className="item-action-primary licita-step1-style-046" onClick={adicionarItem} >+ Novo Item</button>
        <button type="button" className="item-action-secondary licita-step1-style-047" onClick={() => fileInputRef.current?.click()} disabled={importandoXlsx || importandoPdf} >{importandoXlsx ? "Lendo XLSX..." : "Importar XLSX"}</button>
        <button type="button" className="item-action-secondary licita-step1-style-048" onClick={() => pdfInputRef.current?.click()} disabled={importandoPdf} >{importandoPdf ? "Lendo PDF..." : "Importar Cotação PDF"}</button>
      </div>
      <div className="items-table-scroll licita-step1-style-049" >
        <div className="items-table licita-step1-style-050" >
          <div className="items-table-head licita-step1-style-051" >
            <div  className={ ["licita-step1-style-052"].filter(Boolean).join(" ") }>#</div><div  className={ ["licita-step1-style-053"].filter(Boolean).join(" ") }>Descrição</div>{lotes.length > 0 && <div  className={ ["licita-step1-style-054"].filter(Boolean).join(" ") }>Lote</div>}<div  className={ ["licita-step1-style-055"].filter(Boolean).join(" ") }>UN</div><div  className={ ["licita-step1-style-056"].filter(Boolean).join(" ") }>Qtd</div><div  className={ ["licita-step1-style-057"].filter(Boolean).join(" ") }>Vlr Unit.</div><div  className={ ["licita-step1-style-058"].filter(Boolean).join(" ") }>Total</div><div   className={ ["licita-step1-style-059"].filter(Boolean).join(" ") }/>
          </div>
          <div className="items-table-body licita-step1-style-060" >
            {itens.map((item: any, index: number) => {
              const carregando = itemEmMelhoria === item.id;
              const descricao = String(item.descricao || "");
              const erroDescricao = tentouAvancar && !descricao.trim();
              return <div key={item.id} className="item-row licita-step1-style-061" >
                <div className="item-number licita-step1-style-062" >{item.numero || index + 1}</div>
                <div className="item-description-cell licita-step1-style-063" >
                  <textarea
                    ref={(elemento) => ajustarAlturaDescricao(elemento)}
                    required
                    rows={1}
                    value={descricao}
                    onChange={(e) => {
                      ajustarAlturaDescricao(e.currentTarget);
                      atualizarItem(item.id, "descricao", e.target.value);
                    }}
                    disabled={carregando}
                    aria-invalid={erroDescricao || undefined}
                    
                   className={ ["licita-step1-style-064", (erroDescricao ? "licita-step1-style-064-p6-a" : "licita-step1-style-064-p6-b")].filter(Boolean).join(" ") }/>
                  <button type="button" onClick={() => melhorarItem(item)} disabled={carregando || !descricao.trim()} title="Melhorar descrição e unidade deste item com IA" aria-label={`Melhorar descrição e unidade do item ${item.numero || index + 1} com IA`}  className={ ["licita-step1-style-065"].filter(Boolean).join(" ") }>{carregando ? "..." : "✨ IA"}</button>
                </div>
                {lotes.length > 0 && <label className="item-field item-field-lot licita-step1-style-066" >
                  <span  className={ ["licita-step1-style-067"].filter(Boolean).join(" ") }>Lote</span>
                  <select aria-label={`Lote do item ${item.numero || index + 1}`} value={obterLoteIdItem(item, lotes)} onChange={(e) => atribuirItemALote(item.id, e.target.value, index)}  className={ ["licita-step1-style-068"].filter(Boolean).join(" ") }>
                    <option value="">Selecione um lote</option>
                    {lotes.map((lote: any) => <option key={lote.id} value={lote.id}>{lote.nome}</option>)}
                  </select>
                </label>}
                <label className="item-field item-field-unit"><span>Unidade</span><input className="item-unit licita-step1-style-069" type="text" required value={item.un} onChange={(e) => atualizarItem(item.id, "un", e.target.value)} disabled={carregando}  /></label>
                <label className="item-field item-field-quantity"><span>Quantidade</span><input className="item-quantity licita-step1-style-070" type="number" required min="0.0001" step="any" value={item.qtd} onChange={(e) => atualizarItem(item.id, "qtd", parseFloat(e.target.value) || "")} disabled={carregando}  /></label>
                <label className="item-field item-field-price"><span>Valor unitário</span><input className="item-price licita-step1-style-071" type="text" required value={formatarMoeda(Number(item.valor || 0))} onChange={(e) => atualizarItem(item.id, "valor", parseMoeda(e.target.value))} disabled={carregando}  /></label>
                <div className="item-line-total licita-step1-style-072" ><span>Total do item</span><strong>{formatarMoeda(Number(item.qtd || 0) * Number(item.valor || 0))}</strong></div>
                <div className="item-row-actions licita-step1-style-073" >
                  <button type="button" className="item-move-button licita-step1-style-074" aria-label="Mover item para cima" title="Mover para cima" onClick={() => moverItem(index, -1)} disabled={carregando} >↑</button><button type="button" className="item-move-button licita-step1-style-075" aria-label="Mover item para baixo" title="Mover item para baixo" onClick={() => moverItem(index, 1)} disabled={carregando} >↓</button><button type="button" className="item-delete-button licita-step1-style-076" aria-label="Remover item" title="Remover item" onClick={() => removerItem(item.id)} disabled={carregando} >×</button>
                </div>
              </div>;
            })}
            {itens.length === 0 && <div  className={ ["licita-step1-style-077"].filter(Boolean).join(" ") }>Nenhum item adicionado.</div>}
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
        onCancel={() => setLoteParaExcluir(null)}
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
