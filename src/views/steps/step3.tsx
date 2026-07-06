import React from "react";
import { open } from "@tauri-apps/plugin-dialog";

export default function Step3({ dados, atualizarDados }: any) {
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
    : (typeof dados.declAdicionais === 'string' && dados.declAdicionais.trim() !== '' ? [dados.declAdicionais] : []);

  const selecionarArquivo = async (chave: string) => {
    const selected = await open({
      multiple: false,
      filters: [{
        name: "Documentos",
        extensions: ["doc", "docx"]
      }]
    });

    if (selected && typeof selected === "string") {
      const nameStr = selected.split(/[\\/]/).pop() || selected;
      atualizarDados({ [chave]: { name: nameStr, path: selected } });
    }
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
        </div>

        <div className="wiz-grid-2">
          <div className="wiz-field">
            <label className="wiz-label">
              Exclusivo para ME/EPP <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.exclusivo || "NAO"}
              onChange={(e) => atualizarDados({ exclusivo: e.target.value })}
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Permitir Prorrogação? <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.prorrogacaoCheck || "NAO"}
              onChange={(e) => atualizarDados({ prorrogacaoCheck: e.target.value })}
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </div>
        </div>
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
          <div>
            <label className="wiz-label" style={{ marginBottom: "8px" }}>
              Documento de Formalização da Demanda (DFD) <span className="req-star">*</span>
            </label>
            {!dados.arquivoDfd ? (
              <div className="wiz-upload-area" onClick={() => selecionarArquivo("arquivoDfd")}>
                <div className="wiz-upload-icon">📄</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">Selecionar Arquivo DFD</div>
                  <div className="wiz-upload-file">Nenhum selecionado (.doc, .docx)</div>
                </div>
                <div className="wiz-upload-cta">Procurar</div>
              </div>
            ) : (
              <div className="wiz-upload-area has-file" onClick={() => atualizarDados({ arquivoDfd: null })}>
                <div className="wiz-upload-icon">✓</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">DFD Selecionado</div>
                  <div className="wiz-upload-file">{dados.arquivoDfd.name}</div>
                </div>
                <div className="wiz-upload-cta" style={{ color: "var(--wiz-error)" }}>Remover</div>
              </div>
            )}
          </div>

          <div>
            <label className="wiz-label" style={{ marginBottom: "8px" }}>
              Estudo Técnico Preliminar (ETP) <span className="req-star">*</span>
            </label>
            {!dados.arquivoEtp ? (
              <div className="wiz-upload-area" onClick={() => selecionarArquivo("arquivoEtp")}>
                <div className="wiz-upload-icon">📄</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">Selecionar Arquivo ETP</div>
                  <div className="wiz-upload-file">Nenhum selecionado (.doc, .docx)</div>
                </div>
                <div className="wiz-upload-cta">Procurar</div>
              </div>
            ) : (
              <div className="wiz-upload-area has-file" onClick={() => atualizarDados({ arquivoEtp: null })}>
                <div className="wiz-upload-icon">✓</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">ETP Selecionado</div>
                  <div className="wiz-upload-file">{dados.arquivoEtp.name}</div>
                </div>
                <div className="wiz-upload-cta" style={{ color: "var(--wiz-error)" }}>Remover</div>
              </div>
            )}
          </div>

          <div>
            <label className="wiz-label" style={{ marginBottom: "8px" }}>
              Termo de Referência (TR) <span className="req-star">*</span>
            </label>
            {!dados.arquivoTr ? (
              <div className="wiz-upload-area" onClick={() => selecionarArquivo("arquivoTr")}>
                <div className="wiz-upload-icon">📄</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">Selecionar Arquivo TR</div>
                  <div className="wiz-upload-file">Nenhum selecionado (.doc, .docx)</div>
                </div>
                <div className="wiz-upload-cta">Procurar</div>
              </div>
            ) : (
              <div className="wiz-upload-area has-file" onClick={() => atualizarDados({ arquivoTr: null })}>
                <div className="wiz-upload-icon">✓</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">TR Selecionado</div>
                  <div className="wiz-upload-file">{dados.arquivoTr.name}</div>
                </div>
                <div className="wiz-upload-cta" style={{ color: "var(--wiz-error)" }}>Remover</div>
              </div>
            )}
          </div>
        </div>
      </div>

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
                  placeholder="Nome do documento adicional"
                />
                <button
                  type="button"
                  className="wiz-btn-remove"
                  onClick={() => {
                    const novosDocs = (dados.documentosAdicionais || []).filter((_: any, i: number) => i !== index);
                    atualizarDados({ documentosAdicionais: novosDocs });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="wiz-btn-add"
              onClick={() => {
                const novosDocs = [...(dados.documentosAdicionais || []), ""];
                atualizarDados({ documentosAdicionais: novosDocs });
              }}
            >
              <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Adicionar Documento Adicional
            </button>
          </div>
        </div>

        <div>
          <div className="wiz-subsection-title">Declarações Adicionais</div>
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
                  placeholder="Insira a declaração adicional..."
                />
                <button
                  type="button"
                  className="wiz-btn-remove"
                  onClick={() => {
                    const novasDecls = declAdicionaisArray.filter((_: any, i: number) => i !== index);
                    atualizarDados({ declAdicionais: novasDecls });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="wiz-btn-add"
              onClick={() => {
                const novasDecls = [...declAdicionaisArray, ""];
                atualizarDados({ declAdicionais: novasDecls });
              }}
            >
              <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Adicionar Declaração
            </button>
          </div>
        </div>
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📝</div>
          <div>
            <div className="wiz-card-title">Cláusulas Adicionais</div>
            <div className="wiz-card-subtitle">Condições extras de contratante e contratada</div>
          </div>
        </div>

        <div className="wiz-field" style={{ marginBottom: "16px" }}>
          <label className="wiz-label">Cláusulas Adicionais da Contratante</label>
          <textarea
            className="wiz-textarea"
            value={dados.contratante || ""}
            onChange={(e) => atualizarDados({ contratante: e.target.value })}
            placeholder="Insira as cláusulas adicionais da contratante (separe uma a uma com quebra de linha)..."
          />
        </div>

        <div className="wiz-field">
          <label className="wiz-label">Cláusulas Adicionais da Contratada</label>
          <textarea
            className="wiz-textarea"
            value={dados.contratada || ""}
            onChange={(e) => atualizarDados({ contratada: e.target.value })}
            placeholder="Insira as cláusulas adicionais da contratada (separe uma a uma com quebra de linha)..."
          />
        </div>
      </div>

      <div className="wiz-bottom-pad" />
    </div>
  );
}