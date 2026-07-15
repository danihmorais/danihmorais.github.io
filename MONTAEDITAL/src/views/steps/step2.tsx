import React from "react";

interface Pessoa {
  nome: string;
  cargo: string;
}

interface PessoaListProps {
  label: string;
  singularLabel: string;
  items: Pessoa[];
  onChange: (items: Pessoa[]) => void;
}

function PessoaList({ label, singularLabel, items, onChange }: PessoaListProps) {
  const add = () => onChange([...items, { nome: "", cargo: "" }]);

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length ? next : [{ nome: "", cargo: "" }]);
  };

  const update = (i: number, field: keyof Pessoa, value: string) => {
    const next = items.map((p, idx) => (idx === i ? { ...p, [field]: value } : p));
    onChange(next);
  };

  return (
    <div style={{ marginTop: "24px" }}>
      <div className="wiz-subsection-title">
        <span>{label}</span>
        <span className="req-star"> *</span>
      </div>
      <div className="wiz-person-list">
        {items.map((pessoa, i) => (
          <div key={i} className="wiz-person-row">
            <div className="wiz-field wiz-col-2">
              <label className="wiz-label">Nome do {singularLabel}</label>
              <input
                type="text"
                className="wiz-input"
                placeholder="Ex: João da Silva"
                value={pessoa.nome}
                onChange={(e) => update(i, "nome", e.target.value)}
              />
            </div>
            <div className="wiz-field wiz-col-2">
              <label className="wiz-label">Cargo</label>
              <input
                type="text"
                className="wiz-input"
                placeholder="Ex: Diretor, Coordenador…"
                value={pessoa.cargo}
                onChange={(e) => update(i, "cargo", e.target.value)}
              />
            </div>
            <button
              type="button"
              className="wiz-btn-remove"
              onClick={() => remove(i)}
              title="Remover"
              disabled={items.length === 1}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="wiz-btn-add" onClick={add}>
        <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Adicionar {singularLabel}
      </button>
    </div>
  );
}

export default function Step2({ dados, atualizarDados }: any) {
  return (
    <div className="wiz-view">
      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📦</div>
          <div>
            <div className="wiz-card-title">Detalhes do Objeto</div>
            <div className="wiz-card-subtitle">Configurações e dotação orçamentária</div>
          </div>
        </div>

        <div className="wiz-grid-3" style={{ marginBottom: "16px" }}>
          <div className="wiz-field">
            <label className="wiz-label">
              Tipo de Objeto <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.tipoObjeto || "AQUISICAO"}
              onChange={(e) => atualizarDados({ tipoObjeto: e.target.value })}
            >
              <option value="AQUISICAO">Aquisição</option>
              <option value="SERVICO">Serviço</option>
            </select>
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Quantidade de Itens <span className="req-star">*</span>
            </label>
            <input
              type="number"
              className="wiz-input"
              value={dados.quantidadeItens || ""}
              onChange={(e) => atualizarDados({ quantidadeItens: e.target.value })}
              placeholder="Ex: 5"
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Quantidade de Lotes <span className="req-star">*</span>
            </label>
            <input
              type="number"
              className="wiz-input"
              value={dados.quantidadeLotes || ""}
              onChange={(e) => atualizarDados({ quantidadeLotes: e.target.value })}
              placeholder="Ex: 2"
            />
          </div>
        </div>

        <div className="wiz-field" style={{ marginBottom: "16px" }}>
          <label className="wiz-label">
            Objeto do Edital <span className="req-star">*</span>
          </label>
          <textarea
            className="wiz-textarea"
            value={dados.objeto || ""}
            onChange={(e) => atualizarDados({ objeto: e.target.value })}
            placeholder="Descreva o objeto da licitação (conforme consta no TR)..."
          />
        </div>

        <div className="wiz-field" style={{ marginBottom: "16px" }}>
          <label className="wiz-label">
            Dotação Orçamentária <span className="req-star">*</span>
          </label>
          {dados.dotacaoImagens && dados.dotacaoImagens.length > 0 ? (
            <div className="wiz-upload-area has-file" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div className="wiz-upload-icon">🖼️</div>
                <div className="wiz-upload-text">
                  <div className="wiz-upload-label">Imagem em Anexo</div>
                  <div className="wiz-upload-file">{dados.dotacaoImagens.length} arquivo(s) selecionado(s)</div>
                </div>
              </div>
              <button 
                type="button" 
                className="wiz-btn-remove" 
                onClick={() => atualizarDados({ dotacaoImagens: null, dotacao: "" })}
                title="Remover imagem"
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <textarea
                className="wiz-textarea"
                style={{ minHeight: "90px", paddingBottom: "40px" }}
                value={dados.dotacao || ""}
                onChange={(e) => atualizarDados({ dotacao: e.target.value })}
                placeholder="Descreva a dotação ou anexe uma imagem..."
              />
              <div style={{ position: "absolute", bottom: "8px", left: "8px" }}>
                <label 
                  className="wiz-btn-ghost" 
                  style={{ 
                    padding: "4px 10px", 
                    fontSize: "12px", 
                    cursor: "pointer", 
                    borderRadius: "6px", 
                    display: "flex", 
                    gap: "6px", 
                    alignItems: "center",
                    background: "var(--wiz-surface)",
                    border: "1px solid var(--wiz-border)",
                    margin: 0
                  }}
                >
                  <span style={{ fontSize: "14px" }}>📎</span> Anexar Imagem
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        atualizarDados({ dotacaoImagens: files, dotacao: "Ver imagem em anexo" });
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📍</div>
          <div>
            <div className="wiz-card-title">Prazos e Locais</div>
            <div className="wiz-card-subtitle">Execução, entrega e devoluções</div>
          </div>
        </div>
        <div className="wiz-grid-1-2" style={{ marginBottom: "16px" }}>
          <div className="wiz-field">
            <label className="wiz-label">
              Prazo de Devolução <span className="req-star">*</span>
            </label>
            <input
              type="number"
              className="wiz-input"
              value={dados.prazoDevolucao || ""}
              onChange={(e) => atualizarDados({ prazoDevolucao: e.target.value })}
              placeholder="Ex: 5 (dias)"
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Local e Prazo de Execução/Entrega <span className="req-star">*</span>
            </label>
            <textarea
              className="wiz-textarea"
              style={{ minHeight: "80px" }}
              value={dados.execucao || ""}
              onChange={(e) => atualizarDados({ execucao: e.target.value })}
              placeholder="Descreva as condições, prazos e locais..."
            />
          </div>
        </div>
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📑</div>
          <div>
            <div className="wiz-card-title">Especificações e Exigências</div>
            <div className="wiz-card-subtitle">Regras extras, vistoria e amostras</div>
          </div>
        </div>
        
        <div className="wiz-field" style={{ marginBottom: "20px" }}>
          <label className="wiz-label">Especificações Especiais</label>
          <textarea
            className="wiz-textarea"
            value={dados.especificacoesEspeciais || ""}
            onChange={(e) => atualizarDados({ especificacoesEspeciais: e.target.value })}
            placeholder="Insira especificações especiais (opcional)..."
          />
        </div>

        <div className="wiz-grid-2">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="wiz-toggle-row" onClick={() => atualizarDados({ vistoria: !dados.vistoria })}>
              <div className="wiz-toggle-info">
                <div className="wiz-toggle-title">Exigir Vistoria</div>
                <div className="wiz-toggle-desc">Obriga os licitantes a realizarem vistoria técnica.</div>
              </div>
              <div className={`wiz-switch ${dados.vistoria ? "on" : ""}`} />
            </div>
            {dados.vistoria && (
              <textarea
                className="wiz-textarea"
                value={dados.textoVistoria || ""}
                onChange={(e) => atualizarDados({ textoVistoria: e.target.value })}
                placeholder="Descreva as condições da vistoria..."
              />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="wiz-toggle-row" onClick={() => atualizarDados({ amostra: !dados.amostra })}>
              <div className="wiz-toggle-info">
                <div className="wiz-toggle-title">Exigir Amostra</div>
                <div className="wiz-toggle-desc">Obriga o fornecimento de amostras para análise.</div>
              </div>
              <div className={`wiz-switch ${dados.amostra ? "on" : ""}`} />
            </div>
            {dados.amostra && (
              <textarea
                className="wiz-textarea"
                value={dados.textoAmostra || ""}
                onChange={(e) => atualizarDados({ textoAmostra: e.target.value })}
                placeholder="Descreva as condições da amostra..."
              />
            )}
          </div>
        </div>
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">👥</div>
          <div>
            <div className="wiz-card-title">Equipe Responsável</div>
            <div className="wiz-card-subtitle">Gestores e fiscais do contrato/ata</div>
          </div>
        </div>
        <PessoaList
          label="Gestores"
          singularLabel="Gestor"
          items={dados.gestores ?? [{ nome: "", cargo: "" }]}
          onChange={(items) => atualizarDados({ gestores: items })}
        />
        <PessoaList
          label="Fiscais"
          singularLabel="Fiscal"
          items={dados.fiscais ?? [{ nome: "", cargo: "" }]}
          onChange={(items) => atualizarDados({ fiscais: items })}
        />
      </div>
      
      <div className="wiz-bottom-pad" />
    </div>
  );
}