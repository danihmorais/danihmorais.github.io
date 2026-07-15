import React from "react";
import { open } from "@tauri-apps/plugin-dialog";

const styles = {
  container: { display: "flex", flexDirection: "column" as const, gap: "28px" },
  sectionGroup: { display: "flex", flexDirection: "column" as const },
  section: { display: "flex", flexDirection: "column" as const, gap: "12px", alignItems: "flex-start" },
  sectionMargin: { display: "flex", flexDirection: "column" as const, gap: "12px", marginBottom: "16px", alignItems: "flex-start" },
  title: { fontSize: "16px", margin: "0 0 16px 0", color: "var(--text-main)", fontWeight: "600" as const },
  titleCompact: { fontSize: "16px", margin: "0 0 4px 0", color: "var(--text-main)", fontWeight: "600" as const },
  subtitle: { color: "var(--text-muted)", margin: "0 0 16px 0", fontSize: "13px", fontStyle: "italic" },
  subtitleMargin: { color: "var(--text-muted)", margin: "0 0 8px 0", fontSize: "13px" },
  label: { display: "flex", flexDirection: "row" as const, alignItems: "center", justifyContent: "flex-start", gap: "8px", cursor: "pointer", fontSize: "14px", color: "var(--text-main)", width: "max-content", margin: 0, padding: 0 },
  checkboxLabel: (disabled: boolean) => ({ display: "flex", flexDirection: "row" as const, alignItems: "center", justifyContent: "flex-start", gap: "8px", cursor: disabled ? "not-allowed" : "pointer", fontSize: "14px", color: "var(--text-main)", opacity: disabled ? 0.5 : 1, width: "max-content", margin: 0, padding: 0 }),
  radioInput: { margin: 0, padding: 0, width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 },
  labelText: { margin: 0, padding: 0, flexShrink: 0 },
  justificationBox: (error: boolean) => ({ background: "var(--bg-subtle)", padding: "16px", borderRadius: "var(--radius-lg)", border: error ? "1.5px solid var(--btn-danger)" : "1.5px solid var(--border)", display: "flex", flexDirection: "column" as const }),
  justificationTitle: { fontWeight: "600" as const, fontSize: "13px", color: "var(--text-main)", display: "block", marginBottom: "8px" },
  textarea: (error: boolean) => ({ padding: "12px", borderRadius: "var(--radius)", borderColor: error ? "var(--btn-danger)" : "var(--input-border)", fontSize: "13px", minHeight: "60px", resize: "vertical" as const }),
  textareaLarge: (error: boolean) => ({ flex: 1, padding: "12px", borderRadius: "var(--radius-lg)", borderColor: error ? "var(--btn-danger)" : "var(--input-border)", minHeight: "80px", fontSize: "14px", resize: "vertical" as const }),
  errorText: { color: "var(--btn-danger)", fontSize: "12px", display: "block", marginTop: "4px" },
  asterisk: { color: "var(--btn-danger)" },
  counterWrapper: { display: "flex", alignItems: "center", gap: "8px" },
  btn: { width: "40px", height: "40px", borderRadius: "var(--radius)", background: "var(--bg-subtle)", border: "1px solid var(--border)", fontSize: "18px", color: "var(--text-main)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  counterInput: { width: "60px", height: "40px", textAlign: "center" as const, borderRadius: "var(--radius)", borderColor: "var(--input-border)", fontSize: "16px", fontWeight: "600" as const },
  select: { height: "40px", padding: "0 12px", borderRadius: "var(--radius)", borderColor: "var(--input-border)", fontSize: "14px", marginLeft: "8px" },
  attachWrapper: { display: "flex", gap: "16px", alignItems: "flex-start" },
  attachBtn: (hasImg: boolean) => ({ padding: "0 24px", height: "44px", background: hasImg ? "var(--btn-success)" : "var(--btn-primary)", color: "var(--bg-panel)", border: "none", borderRadius: "var(--radius-lg)", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" })
};

const RadioOption = ({ label, value, checked, onChange }: any) => (
  <label style={styles.label}>
    <input type="radio" value={value} checked={checked} onChange={onChange} style={styles.radioInput} />
    <span style={styles.labelText}>{label}</span>
  </label>
);

const JustificationBox = ({ label, value, onChange, errorMsg }: any) => {
  const hasError = value.trim() === "";
  return (
    <div style={styles.justificationBox(hasError)}>
      <label style={styles.justificationTitle}>
        {label} <span style={styles.asterisk}>*</span>
      </label>
      <textarea
        value={value}
        onChange={onChange}
        style={styles.textarea(hasError)}
      />
      {hasError && <span style={styles.errorText}>{errorMsg}</span>}
    </div>
  );
};

export default function Step5({ dados, atualizarDados }: any) {
  const handleAnexarImagem = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Selecione a imagem da dotação",
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      if (selected) {
        const caminhoFinal = Array.isArray(selected) ? selected[0] : selected;
        atualizarDados({ caminhoImagemDotacao: caminhoFinal });
      }
    } catch (err: any) {
      alert("Erro ao selecionar imagem: " + String(err));
    }
  };

  const decrementarVigencia = (e: React.MouseEvent) => {
    e.preventDefault();
    if (dados.vigenciaNum > 1) {
      atualizarDados({ vigenciaNum: dados.vigenciaNum - 1 });
    }
  };

  const incrementarVigencia = (e: React.MouseEvent) => {
    e.preventDefault();
    atualizarDados({ vigenciaNum: dados.vigenciaNum + 1 });
  };

  const temLote = dados.itens && dados.itens.some((item: any) => item.lote && item.lote.toString().trim() !== "");
  const faltaDotacao = dados.dotacao.trim() === "" && !dados.caminhoImagemDotacao;

  return (
    <div style={styles.container}>
      <div style={styles.sectionGroup}>
        <h2 style={styles.title}>Tipo de Instrumento</h2>
        <div style={styles.sectionMargin}>
          <RadioOption 
            label="CONTRATO (Certeza da quantidade)" 
            value="CONTRATO" 
            checked={dados.instrumento === "CONTRATO"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: dados.prorrogar })} 
          />
          <RadioOption 
            label="ATA DE REGISTRO DE PREÇOS (Sem certeza da quantidade)" 
            value="ATA" 
            checked={dados.instrumento === "ATA"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: dados.prorrogar })} 
          />
          <RadioOption 
            label="SEM CONTRATO (Dispensa pequeno valor)" 
            value="SEM_CONTRATO" 
            checked={dados.instrumento === "SEM_CONTRATO"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: false })} 
          />
        </div>
        <label style={styles.checkboxLabel(dados.instrumento === "SEM_CONTRATO")}>
          <input 
            type="checkbox" 
            checked={dados.prorrogar} 
            disabled={dados.instrumento === "SEM_CONTRATO"}
            onChange={(e) => atualizarDados({ prorrogar: e.target.checked })}
            style={styles.radioInput}
          />
          <span style={styles.labelText}>Permitir prorrogação?</span>
        </label>
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.title}>Participação ME/EPP</h2>
        <div style={styles.section}>
          <RadioOption 
            label="Exclusiva para ME/EPP (Até R$ 80.000,00)" 
            value="SIM" 
            checked={dados.meepp === "SIM"} 
            onChange={(e: any) => atualizarDados({ meepp: e.target.value })} 
          />
          <RadioOption 
            label="Não Exclusiva (Maior que R$ 80.000,00 ou ampla participação)" 
            value="NAO" 
            checked={dados.meepp === "NAO"} 
            onChange={(e: any) => atualizarDados({ meepp: e.target.value })} 
          />
        </div>
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.titleCompact}>Critério de Julgamento</h2>
        <p style={styles.subtitle}>
          {temLote 
            ? "Foi detectado o uso de lotes na listagem de itens. Apenas a opção de julgamento por Lote está disponível." 
            : "Regra geral da Lei 14.133/21: A adjudicação deve ser preferencialmente por ITEM para ampliar a concorrência."}
        </p>
        <div style={styles.sectionMargin}>
          {!temLote && (
            <>
              <RadioOption label="Menor preço por item" value="ITEM" checked={dados.criterio === "ITEM"} onChange={(e: any) => atualizarDados({ criterio: e.target.value })} />
              <RadioOption label="Menor preço global" value="GLOBAL" checked={dados.criterio === "GLOBAL"} onChange={(e: any) => atualizarDados({ criterio: e.target.value })} />
            </>
          )}
          {temLote && (
            <RadioOption label="Menor preço por lote" value="LOTE" checked={dados.criterio === "LOTE"} onChange={(e: any) => atualizarDados({ criterio: e.target.value })} />
          )}
        </div>

        {(dados.criterio === "GLOBAL" || dados.criterio === "LOTE") && (
          <JustificationBox 
            label="Motivação para o agrupamento (Global/Lote):"
            value={dados.motivoCriterio}
            onChange={(e: any) => atualizarDados({ motivoCriterio: e.target.value })}
            errorMsg="Este campo é obrigatório."
          />
        )}
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.titleCompact}>Modalidade</h2>
        <p style={styles.subtitle}>Regra geral da Lei 14.133/21: O Pregão Eletrônico é a modalidade obrigatória padrão.</p>
        <div style={styles.sectionMargin}>
          <RadioOption label="Pregão Eletrônico" value="PREGAO_ELETRONICO" checked={dados.modalidade === "PREGAO_ELETRONICO"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption label="Dispensa por e-mail" value="DISPENSA_EMAIL" checked={dados.modalidade === "DISPENSA_EMAIL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption label="Dispensa com lances na BLL" value="DISPENSA_BLL" checked={dados.modalidade === "DISPENSA_BLL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption label="Pregão Presencial" value="PREGAO_PRESENCIAL" checked={dados.modalidade === "PREGAO_PRESENCIAL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
        </div>

        {dados.modalidade !== "PREGAO_ELETRONICO" && (
          <JustificationBox 
            label={dados.modalidade === "PREGAO_PRESENCIAL" ? "Justificativa (Válido para municípios com até 20k habitantes até abril de 2027):" : "Justificativa (Atenção: Limite legal de até 65k ao todo ao longo do ano):"}
            value={dados.motivoModalidade}
            onChange={(e: any) => atualizarDados({ motivoModalidade: e.target.value })}
            errorMsg="Este campo é obrigatório."
          />
        )}
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.title}>Vigência do Contrato/Ata (Máximo 1 ano)</h2>
        <div style={styles.counterWrapper}>
          <button type="button" onClick={decrementarVigencia} style={styles.btn}>-</button>
          <input 
            type="text" 
            value={dados.vigenciaNum} 
            readOnly 
            style={styles.counterInput} 
          />
          <button type="button" onClick={incrementarVigencia} style={styles.btn}>+</button>
          <select 
            value={dados.vigenciaUnidade} 
            onChange={(e) => atualizarDados({ vigenciaUnidade: e.target.value })}
            style={styles.select}
          >
            <option value="Dias">Dias</option>
            <option value="Meses">Meses</option>
            <option value="Ano(s)">Ano(s)</option>
          </select>
        </div>
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.title}>
          Dotação Orçamentária <span style={styles.asterisk}>*</span>
        </h2>
        <p style={styles.subtitleMargin}>Preencha o campo de texto ou anexe uma imagem do comprovante de dotação.</p>
        <div style={styles.attachWrapper}>
          <textarea 
            value={dados.dotacao}
            onChange={(e) => atualizarDados({ dotacao: e.target.value })}
            placeholder="Descreva a dotação orçamentária..."
            style={styles.textareaLarge(faltaDotacao)}
          />
          <button 
            type="button"
            onClick={handleAnexarImagem} 
            style={styles.attachBtn(!!dados.caminhoImagemDotacao)}
          >
            {dados.caminhoImagemDotacao ? "Imagem Anexada ✓" : "Anexar Imagem"}
          </button>
        </div>
        {faltaDotacao && <span style={styles.errorText}>É obrigatório preencher a dotação ou anexar uma imagem.</span>}
      </div>

      <div style={styles.sectionGroup}>
        <h2 style={styles.title}>Plano Anual de Contratações (PAC)</h2>
        <div style={styles.sectionMargin}>
          <RadioOption label="Sim, previsto no PAC" value="SIM" checked={dados.pac === "SIM"} onChange={(e: any) => atualizarDados({ pac: e.target.value })} />
          <RadioOption label="Não previsto no PAC" value="NAO" checked={dados.pac === "NAO"} onChange={(e: any) => atualizarDados({ pac: e.target.value })} />
        </div>
        
        {dados.pac === "NAO" && (
          <JustificationBox 
            label="Justificativa para a não inclusão no PAC:"
            value={dados.motivoPac}
            onChange={(e: any) => atualizarDados({ motivoPac: e.target.value })}
            errorMsg="Este campo é obrigatório."
          />
        )}
      </div>
    </div>
  );
}