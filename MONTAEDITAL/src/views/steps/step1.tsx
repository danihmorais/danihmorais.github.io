import React from "react";

function anoAtual(): string {
  return String(new Date().getFullYear());
}

function mascararNumeroProcesso(valor: string): string {
  const limpo = valor.replace(/[^\d/]/g, "");
  const posicaoBarra = limpo.indexOf("/");

  if (posicaoBarra >= 0) {
    const antes = limpo.slice(0, posicaoBarra).replace(/\D/g, "").slice(0, 3);
    const depois = limpo.slice(posicaoBarra + 1).replace(/\D/g, "").slice(0, 4);
    return `${antes}/${depois}`;
  }

  const numeros = limpo.replace(/\D/g, "").slice(0, 3);
  return numeros;
}

function completarAnoAtual(valor: string): string {
  const mascarado = mascararNumeroProcesso(valor);

  if (/^\d{2,3}$/.test(mascarado)) {
    return `${mascarado}/${anoAtual()}`;
  }

  return mascarado;
}

function MascaraNumero({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (valor: string) => void;
}) {
  const vazio = !valor;

  return (
    <div style={{ position: "relative" }}>
      {vazio && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            pointerEvents: "none",
            fontSize: "14px",
            fontFamily: "inherit",
            zIndex: 1,
          }}
        >
          <span style={{ color: "var(--wiz-text-3)", opacity: 0.35 }}>XX</span>
          <span style={{ color: "var(--wiz-text-3)", opacity: 0.5 }}>/</span>
          <span style={{ color: "var(--wiz-text-3)", opacity: 0.85 }}>{anoAtual()}</span>
        </div>
      )}
      <input
        type="text"
        className="wiz-input"
        value={valor}
        onChange={(e) => onChange(mascararNumeroProcesso(e.target.value))}
        maxLength={8}
        style={{ position: "relative", zIndex: 2, background: vazio ? "transparent" : undefined }}
      />
    </div>
  );
}

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

    if (val === "LEILAO_ELETRONICO") {
      updates.instrumento = "SEM_CONTRATO";
      updates.criterios = "ITEM";
    } else if (dados.instrumento === "SEM_CONTRATO") {
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
            <MascaraNumero
              valor={dados.numeroProcesso || ""}
              onChange={(valor) => atualizarDados({ numeroProcesso: valor })}
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">
              Número do Edital <span className="req-star">*</span>
            </label>
            <MascaraNumero
              valor={dados.numeroModalidade || ""}
              onChange={(valor) => atualizarDados({ numeroModalidade: valor })}
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
              <option value="LEILAO_ELETRONICO">Leilão Eletrônico</option>
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
              disabled={dados.modalidade === "LEILAO_ELETRONICO"}
            >
              {dados.modalidade === "LEILAO_ELETRONICO" ? (
                <option value="ITEM">Maior Preço por Item</option>
              ) : (
                <>
                  <option value="ITEM">Menor Preço por Item</option>
                  <option value="LOTE">Menor Preço por Lote</option>
                  <option value="GLOBAL">Menor Preço Global</option>
                </>
              )}
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
              disabled={dados.modalidade === "LEILAO_ELETRONICO"}
            >
              {dados.modalidade === "LEILAO_ELETRONICO" ? (
                <option value="SEM_CONTRATO">Sem contrato</option>
              ) : (
                <>
                  <option value="CONTRATO">Contrato Regular</option>
                  {(dados.modalidade === "DISPENSA" || dados.modalidade === "DISPENSA_BLL") && (
                    <option value="SEM_CONTRATO">Sem contrato</option>
                  )}
                  {!(dados.modalidade === "DISPENSA" || dados.modalidade === "DISPENSA_BLL") && (
                    <option value="ATA">Ata de Registro de Preços</option>
                  )}
                </>
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