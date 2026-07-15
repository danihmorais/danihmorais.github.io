import React from "react";

export default function Step1({ dados, atualizarDados }: any) {
  const handleModalidadeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const updates: any = { modalidade: val };

    if (val !== "PREGAO_PRESENCIAL") {
      updates.arquivoMagnetico = false;
    }

    if ((val === "DISPENSA" || val === "DISPENSA_BLL") && dados.instrumento === "ATA") {
      updates.instrumento = "CONTRATO";
    }

    atualizarDados(updates);
  };

  return (
    <div className="wiz-view">
      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">📄</div>
          <div>
            <div className="wiz-card-title">Informações do Processo</div>
            <div className="wiz-card-subtitle">Identificação básica da licitação</div>
          </div>
        </div>
        <div className="wiz-grid-2">
          <div className="wiz-field">
            <label className="wiz-label">
              Número do Processo <span className="req-star">*</span>
            </label>
            <input
              type="text"
              className="wiz-input"
              value={dados.numeroProcesso || ""}
              onChange={(e) => atualizarDados({ numeroProcesso: e.target.value })}
              placeholder="Ex: 25/2026"
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Número do Edital <span className="req-star">*</span>
            </label>
            <input
              type="text"
              className="wiz-input"
              value={dados.numeroModalidade || ""}
              onChange={(e) => atualizarDados({ numeroModalidade: e.target.value })}
              placeholder="Ex: 05/2026"
            />
          </div>
        </div>
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">⚖️</div>
          <div>
            <div className="wiz-card-title">Classificação</div>
            <div className="wiz-card-subtitle">Modalidade, critério e instrumento</div>
          </div>
        </div>
        <div className="wiz-grid-3">
          <div className="wiz-field">
            <label className="wiz-label">
              Modalidade <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.modalidade || "PREGAO_ELETRONICO"}
              onChange={handleModalidadeChange}
            >
              <option value="PREGAO_ELETRONICO">Pregão Eletrônico</option>
              <option value="PREGAO_PRESENCIAL">Pregão Presencial</option>
              <option value="DISPENSA">Dispensa por E-Mail</option>
              <option value="DISPENSA_BLL">Dispensa Eletrônica BLL</option>
            </select>
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Critério de Julgamento <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.criterios || "ITEM"}
              onChange={(e) => atualizarDados({ criterios: e.target.value })}
            >
              <option value="ITEM">Menor Preço por Item</option>
              <option value="LOTE">Menor Preço por Lote</option>
              <option value="GLOBAL">Menor Preço Global</option>
            </select>
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Instrumento <span className="req-star">*</span>
            </label>
            <select
              className="wiz-select"
              value={dados.instrumento || "CONTRATO"}
              onChange={(e) => atualizarDados({ instrumento: e.target.value })}
            >
              <option value="CONTRATO">Contrato Regular</option>
              {!(dados.modalidade === "DISPENSA" || dados.modalidade === "DISPENSA_BLL") && (
                <option value="ATA">Ata de Registro de Preços</option>
              )}
            </select>
          </div>
        </div>
        {dados.modalidade === "PREGAO_PRESENCIAL" && (
          <div className="wiz-toggle-row" style={{ marginTop: "16px" }} onClick={() => atualizarDados({ arquivoMagnetico: !dados.arquivoMagnetico })}>
            <div className="wiz-toggle-info">
              <div className="wiz-toggle-title">Exigir Arquivo Magnético</div>
              <div className="wiz-toggle-desc">Habilita a obrigatoriedade de entrega de mídia digital contendo a proposta.</div>
            </div>
            <div className={`wiz-switch ${dados.arquivoMagnetico ? "on" : ""}`} />
          </div>
        )}
      </div>

      <div className="wiz-card">
        <div className="wiz-card-header">
          <div className="wiz-card-icon">🗓️</div>
          <div>
            <div className="wiz-card-title">Datas e Horários</div>
            <div className="wiz-card-subtitle">Prazos e agendamento da sessão</div>
          </div>
        </div>
        <div className="wiz-grid-2">
          <div className="wiz-field">
            <label className="wiz-label">
              Início Rec. Propostas <span className="req-star">*</span>
            </label>
            <input
              type="date"
              className="wiz-input"
              value={dados.dataRecProp1 || ""}
              onChange={(e) => atualizarDados({ dataRecProp1: e.target.value })}
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Data do Edital <span className="req-star">*</span>
            </label>
            <input
              type="date"
              className="wiz-input"
              value={dados.dataEdital || ""}
              onChange={(e) => atualizarDados({ dataEdital: e.target.value })}
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Data da Sessão <span className="req-star">*</span>
            </label>
            <input
              type="date"
              className="wiz-input"
              value={dados.dataSessao || ""}
              onChange={(e) => atualizarDados({ dataSessao: e.target.value })}
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Horário da Sessão <span className="req-star">*</span>
            </label>
            <input
              type="time"
              className="wiz-input"
              value={dados.horaSessao || ""}
              onChange={(e) => atualizarDados({ horaSessao: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}