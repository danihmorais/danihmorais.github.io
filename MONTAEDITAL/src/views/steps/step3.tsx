import React from "react";
import { limparNumeracao } from "../../utils/limparNumeracao";

export default function Step3({ dados, atualizarDados }: any) {
  const isLeilao = dados.modalidade === "LEILAO_ELETRONICO";
  const obrigacoesPreenchidas = !!dados.contratante?.trim() && !!dados.contratada?.trim();

  const handleValorChange = (e: any) => {
    let v = e.target.value.replace(/\D/g, "");
    if (v === "") {
      atualizarDados({ valor: "" });
      return;
    }
    const valNum = parseInt(v, 10) / 100;
    const formatado = valNum.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    atualizarDados({ valor: formatado });
  };

  const vigenciaArr = (dados.vigencia || "").split(" ");
  const numVigencia = vigenciaArr.length > 0 && !isNaN(Number(vigenciaArr[0])) ? vigenciaArr[0] : "";
  const unitVigencia = vigenciaArr.length > 1 ? vigenciaArr[1] : "meses";

  const declAdicionaisArray = Array.isArray(dados.declAdicionais)
    ? dados.declAdicionais
    : (typeof dados.declAdicionais === "string" && dados.declAdicionais.trim() !== "" ? [dados.declAdicionais] : []);

  const documentosAdicionaisArray = Array.isArray(dados.documentosAdicionais)
    ? dados.documentosAdicionais
    : [];

  const documentosPreenchidos = documentosAdicionaisArray.filter(
    (doc: string) => typeof doc === "string" && doc.trim() !== ""
  );

  const proximoNumeroDocumento = 12 + documentosPreenchidos.length;

  const selecionarArquivo = (
    event: React.ChangeEvent<HTMLInputElement>,
    chave: string
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    atualizarDados({ [chave]: file });
  };

  const handlePagamentoChange = (value: string) => {
    if (!obrigacoesPreenchidas) return;
    atualizarDados({ pagamento: limparNumeracao(value) });
  };

  return (
    <div className="wiz-view">
      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">💰</div>
          <div>
            <div className="wiz-card-title">Valores e Vigência</div>
            <div className="wiz-card-subtitle">Estimativas, ME/EPP e prazos</div>
          </div>
        </div>

        <div className="wiz-grid-2" style={{ marginBottom: "16px" }}>
          <div className="wiz-field">
            <label className="wiz-label">
              Valor Estimado <span className="req-star">*</span>
            </label>
            <div className="wiz-prefix-wrap">
              <input
                type="text"
                className="wiz-input"
                style={{ paddingLeft: "12px" }}
                value={dados.valor || ""}
                onChange={handleValorChange}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          {!isLeilao && (
            <div className="wiz-field">
              <label className="wiz-label">
                Vigência <span className="req-star">*</span>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="number"
                  className="wiz-input"
                  value={numVigencia}
                  onChange={(e) => atualizarDados({ vigencia: `${e.target.value} ${unitVigencia}`.trim() })}
                  placeholder="Ex: 12"
                  style={{ width: "60%" }}
                />
                <select
                  className="wiz-select"
                  value={unitVigencia}
                  onChange={(e) => atualizarDados({ vigencia: `${numVigencia} ${e.target.value}`.trim() })}
                  style={{ width: "40%" }}
                >
                  <option value="dias">Dias</option>
                  <option value="meses">Meses</option>
                  <option value="anos">Anos</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {!isLeilao && (
          <div className="wiz-grid-2">
            <div className="wiz-field">
              <label className="wiz-label">
                Exclusivo para ME/EPP <span className="req-star">*</span>
              </label>
              <select className="wiz-select" value={dados.exclusivo || "NAO"} onChange={(e) => atualizarDados({ exclusivo: e.target.value })}>
                <option value="NAO">Não</option>
                <option value="SIM">Sim</option>
              </select>
            </div>
            <div className="wiz-field">
              <label className="wiz-label">
                Permitir Prorrogação do Instrumento Contratual? <span className="req-star">*</span>
              </label>
              <select className="wiz-select" value={dados.prorrogacaoCheck || "NAO"} onChange={(e) => atualizarDados({ prorrogacaoCheck: e.target.value })}>
                <option value="NAO">Não</option>
                <option value="SIM">Sim</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📎</div>
          <div>
            <div className="wiz-card-title">Documentos Base</div>
            <div className="wiz-card-subtitle">Anexe os arquivos para compor o edital</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {(["arquivoDfd", "arquivoEtp", "arquivoTr"] as const).map((chave) => {
            const nomes: Record<string, string> = {
              arquivoDfd: "Documento de Formalização da Demanda (DFD)",
              arquivoEtp: "Estudo Técnico Preliminar (ETP)",
              arquivoTr: "Termo de Referência (TR)",
            };
            const siglas: Record<string, string> = { arquivoDfd: "DFD", arquivoEtp: "ETP", arquivoTr: "TR" };
            return (
              <div key={chave}>
                <label className="wiz-label" style={{ marginBottom: "8px" }}>
                  {nomes[chave]} <span className="req-star">*</span>
                </label>
                {!dados[chave] ? (
                  <label className="wiz-upload-area" style={{ cursor: "pointer" }}>
                    <input type="file" accept=".doc,.docx" style={{ display: "none" }} onChange={(e) => selecionarArquivo(e, chave)} />
                    <div className="wiz-upload-icon">📄</div>
                    <div className="wiz-upload-text">
                      <div className="wiz-upload-label">Selecionar Arquivo {siglas[chave]}</div>
                      <div className="wiz-upload-file">Nenhum selecionado (.doc, .docx)</div>
                    </div>
                    <div className="wiz-upload-cta">Procurar</div>
                  </label>
                ) : (
                  <div className="wiz-upload-area has-file" onClick={() => atualizarDados({ [chave]: null })}>
                    <div className="wiz-upload-icon">✓</div>
                    <div className="wiz-upload-text">
                      <div className="wiz-upload-label">{siglas[chave]} Selecionado</div>
                      <div className="wiz-upload-file">{dados[chave].name}</div>
                    </div>
                    <div className="wiz-upload-cta" style={{ color: "var(--wiz-error)" }}>Remover</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isLeilao && (
        <div className="wiz-card">
          <div className="wiz-card-header">
            <div className="wiz-card-icon">➕</div>
            <div>
              <div className="wiz-card-title">Documentos & Declarações Adicionais</div>
              <div className="wiz-card-subtitle">Itens extras exigidos no processo</div>
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <div className="wiz-subsection-title">Documentos Adicionais</div>
            <div style={{ margin: "6px 0 12px", color: "var(--wiz-text-3)", fontSize: "13px", lineHeight: 1.5 }}>
              Insira <strong>APENAS os documentos adicionais a partir do Documento 12</strong> do Termo de Referência (Documento 12 em diante). Não informe aqui os documentos já previstos até o Documento 11 e não inclua declarações; esses documentos serão adicionados automaticamente ao Edital.
            </div>

            <div className="wiz-doc-preview">
              <div className="wiz-doc-preview-head">
                <div>
                  <div className="wiz-doc-preview-title">Como a numeração ficará no Edital</div>
                  <div className="wiz-doc-preview-subtitle">
                    A numeração é automática e segue somente os documentos preenchidos.
                  </div>
                </div>
                <div className="wiz-doc-preview-auto">AUTOMÁTICA</div>
              </div>

              <div className="wiz-doc-preview-list">
                {documentosPreenchidos.length > 0 ? (
                  documentosPreenchidos.map((doc: string, index: number) => (
                    <div key={index} className="wiz-doc-preview-row">
                      <span className="wiz-doc-preview-number">
                        Documento {(12 + index).toString().padStart(2, "0")}
                      </span>
                      <span className="wiz-doc-preview-text">{doc.trim()}</span>
                    </div>
                  ))
                ) : (
                  <div className="wiz-doc-preview-empty">
                    <span className="wiz-doc-preview-number">Documento 12</span>
                    <span>O primeiro documento adicional preenchido será numerado aqui.</span>
                  </div>
                )}
              </div>

              <div className="wiz-doc-preview-next">
                <div className="wiz-doc-preview-next-item">
                  <span className="wiz-doc-preview-label">Declarações padrão</span>
                  <strong>Documento {proximoNumeroDocumento.toString().padStart(2, "0")}</strong>
                </div>
                <div className="wiz-doc-preview-arrow">→</div>
                <div className="wiz-doc-preview-next-item">
                  <span className="wiz-doc-preview-label">Proposta</span>
                  <strong>Documento {(proximoNumeroDocumento + 1).toString().padStart(2, "0")}</strong>
                </div>
              </div>

              <div className="wiz-doc-preview-hint">
                Linhas deixadas em branco não entram na numeração e não consomem número.
              </div>
            </div>

            <div className="wiz-person-list">
              {(dados.documentosAdicionais || []).map((doc: string, index: number) => (
                <div key={index} className="wiz-person-row" style={{ gridTemplateColumns: "1fr 36px" }}>
                  <input
                    type="text"
                    className="wiz-input"
                    value={doc}
                    onChange={(e) => {
                      const novosDocs = [...(dados.documentosAdicionais || [])];
                      novosDocs[index] = e.target.value;
                      atualizarDados({ documentosAdicionais: novosDocs });
                    }}
                    placeholder="Ex.: Documento 12 – ..."
                  />
                  <button type="button" className="wiz-btn-remove" onClick={() => atualizarDados({ documentosAdicionais: (dados.documentosAdicionais || []).filter((_: any, i: number) => i !== index) })}>✕</button>
                </div>
              ))}
              <button type="button" className="wiz-btn-add" onClick={() => atualizarDados({ documentosAdicionais: [...(dados.documentosAdicionais || []), ""] })}>
                <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Adicionar Documento Adicional
              </button>
            </div>
          </div>

          <div>
            <div className="wiz-subsection-title">Declarações Adicionais</div>
            <div style={{ margin: "6px 0 12px", color: "var(--wiz-text-3)", fontSize: "13px", lineHeight: 1.5 }}>
              Informe <strong>apenas declarações especiais</strong>, que não sejam declarações padrão já previstas no modelo do Edital.
            </div>
            <div className="wiz-person-list">
              {declAdicionaisArray.map((decl: string, index: number) => (
                <div key={index} className="wiz-person-row" style={{ gridTemplateColumns: "1fr 36px" }}>
                  <textarea
                    className="wiz-textarea"
                    style={{ minHeight: "50px" }}
                    value={decl}
                    onChange={(e) => {
                      const novasDecls = [...declAdicionaisArray];
                      novasDecls[index] = e.target.value;
                      atualizarDados({ declAdicionais: novasDecls });
                    }}
                    placeholder="Insira somente uma declaração especial, não padrão..."
                  />
                  <button type="button" className="wiz-btn-remove" onClick={() => atualizarDados({ declAdicionais: declAdicionaisArray.filter((_: any, i: number) => i !== index) })}>✕</button>
                </div>
              ))}
              <button type="button" className="wiz-btn-add" onClick={() => atualizarDados({ declAdicionais: [...declAdicionaisArray, ""] })}>
                <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Adicionar Declaração
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLeilao && (
        <>
          <div className="wiz-card">
            <div className="wiz-card-header">
              <div className="wiz-card-icon">📝</div>
              <div>
                <div className="wiz-card-title">Cláusulas Adicionais</div>
                <div className="wiz-card-subtitle">Condições extras da contratante e contratada</div>
              </div>
            </div>

            <div className="wiz-field" style={{ marginBottom: "16px" }}>
              <label className="wiz-label">Cláusulas da Contratante <span className="req-star">*</span></label>
              <div style={{ marginBottom: "8px", color: "var(--wiz-text-3)", fontSize: "13px", lineHeight: 1.5 }}>
                Insira <strong>TODAS as cláusulas da Contratante</strong>. Ao colar o conteúdo, a numeração no início das cláusulas será removida automaticamente.
              </div>
              <textarea
                className="wiz-textarea"
                value={dados.contratante || ""}
                onChange={(e) => atualizarDados({ contratante: limparNumeracao(e.target.value) })}
                placeholder="Cole TODAS as cláusulas da Contratante..."
              />
            </div>

            <div className="wiz-field">
              <label className="wiz-label">Cláusulas da Contratada <span className="req-star">*</span></label>
              <div style={{ marginBottom: "8px", color: "var(--wiz-text-3)", fontSize: "13px", lineHeight: 1.5 }}>
                Insira <strong>TODAS as cláusulas da Contratada</strong>. Ao colar o conteúdo, a numeração no início das cláusulas será removida automaticamente.
              </div>
              <textarea
                className="wiz-textarea"
                value={dados.contratada || ""}
                onChange={(e) => atualizarDados({ contratada: limparNumeracao(e.target.value) })}
                placeholder="Cole TODAS as cláusulas da Contratada..."
              />
            </div>
          </div>

          <div className="wiz-card">
            <div className="wiz-card-header">
              <div className="wiz-card-icon">💳</div>
              <div>
                <div className="wiz-card-title">Pagamento</div>
                <div className="wiz-card-subtitle">Condições e regras para pagamento</div>
              </div>
            </div>

            <div className="wiz-field" style={{ marginBottom: "16px" }}>
              <label className="wiz-label">Cláusulas de Pagamento <span className="req-star">*</span></label>
              <div style={{ marginBottom: "8px", color: "var(--wiz-text-3)", fontSize: "13px", lineHeight: 1.5 }}>
                Insira <strong>TODAS as cláusulas de pagamento</strong> que constarem no Termo de Referência. Ao colar o conteúdo, a numeração no início das cláusulas será removida automaticamente.
              </div>
              <textarea
                className="wiz-textarea"
                value={dados.pagamento || ""}
                onChange={(e) => handlePagamentoChange(e.target.value)}
                placeholder="Cole TODAS as cláusulas de pagamento do TR... A numeração colada no início das cláusulas será removida automaticamente."}
              />
            </div>
          </div>
        </>
      )}
      <div className="wiz-bottom-pad" />
    </div>
  );
}
