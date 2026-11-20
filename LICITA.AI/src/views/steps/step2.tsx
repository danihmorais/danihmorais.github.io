import ImportarItensPlanilha from "../../components/ImportarItensPlanilha";
import React from "react";

export default function Step2({ dados, atualizarDados }: any) {
  return (
    <div className="step-form step-form--execution">
      <ImportarItensPlanilha onImport={(itens) => atualizarDados("itens", itens)} />

      <div className="step-section-heading">
        <h2 className="step2-heading">
          Condições de Execução e Prazos <span className="step-required">*</span>
        </h2>
        <p className="step2-description">Informe os principais requisitos de execução, prazos e medidas de controle de qualidade.</p>
      </div>

      <div className="execution-options">
        <label className="step2-checkbox-label">
          <input 
            type="checkbox" 
            checked={dados.amostra} 
            onChange={(e) => atualizarDados({ amostra: e.target.checked })} 

          />
          Exigir amostra
        </label>

        <label className="step2-checkbox-label">
          <input 
            type="checkbox" 
            checked={dados.vistoria} 
            onChange={(e) => atualizarDados({ vistoria: e.target.checked })} 

          />
          Exigir vistoria
        </label>
      </div>

      <div className="execution-description">
        <textarea
          id="step2-execucao"
          required
          value={dados.execucao}
          aria-label="Condições de execução e prazos"
          aria-invalid={!String(dados.execucao || "").trim() || undefined}
          aria-describedby={!String(dados.execucao || "").trim() ? "step2-execucao-error" : undefined}
          onChange={(e) => atualizarDados({ execucao: e.target.value })}
          placeholder="Descreva aqui as regras de entrega, prazos, locais, garantias e demais condições..."
          className="step2-execucao-field"
        />
        {!String(dados.execucao || "").trim() && <span id="step2-execucao-error" className="step2-error" role="alert">Este campo é obrigatório.</span>}
      </div>
    </div>
  );
}