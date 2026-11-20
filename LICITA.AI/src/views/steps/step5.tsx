import React from "react";
import DotacaoEditor, { type DotacaoBloco } from "../../components/DotacaoEditor";
import { obterLotes } from "../../utils/lotes";
import {
  calcularValorEstimadoItens,
  exclusividadeMeeppPermitida,
  formatarLimiteMeepp,
  LIMITE_EXCLUSIVIDADE_MEEPP,
} from "../../utils/regrasContratacao";

const RadioOption = ({ label, value, checked, onChange, disabled = false, name }: any) => (
  <label className={"step5-radio-label" + (disabled ? " is-disabled" : "")}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="step5-radio-input" />
    <span className="step5-label-text">{label}</span>
  </label>
);

const JustificationBox = ({ label, value, onChange, errorMsg, mostrarErro = false, description = "", placeholder = "" }: any) => {
  const id = React.useId();
  const hasError = mostrarErro && String(value || "").trim() === "";
  return (
    <div className={"setting-justification step5-justification" + (hasError ? " has-error" : "")}>
      <label htmlFor={id} className="step5-justification-title">
        {label} <span className="step5-asterisk">*</span>
      </label>
      {description && <p className="step5-description">{description}</p>}
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? id + "-error" : undefined}
        className={"step5-textarea" + (hasError ? " has-error" : "")}
      />
      {hasError && <span id={id + "-error"} className="step5-error">{errorMsg}</span>}
    </div>
  );
};

export default function Step5({ dados, atualizarDados, tentouAvancar = false }: any) {
  const blocosDotacao: DotacaoBloco[] = React.useMemo(() => {
    if (Array.isArray(dados.dotacaoBlocos) && dados.dotacaoBlocos.length > 0) {
      return dados.dotacaoBlocos;
    }

    const blocosLegados: DotacaoBloco[] = [];
    if (String(dados.dotacao || "").trim()) {
      blocosLegados.push({ tipo: "texto", texto: String(dados.dotacao) });
    }
    if (dados.caminhoImagemDotacao) {
      blocosLegados.push({ tipo: "imagem", imagemBase64: dados.caminhoImagemDotacao });
    }
    return blocosLegados;
  }, [dados.dotacaoBlocos, dados.dotacao, dados.caminhoImagemDotacao]);

  const atualizarBlocosDotacao = (novosBlocos: DotacaoBloco[]) => {
    const texto = novosBlocos
      .filter((bloco) => bloco.tipo === "texto" && String(bloco.texto || "").trim())
      .map((bloco) => String(bloco.texto || ""))
      .join("\n");

    atualizarDados({
      dotacaoBlocos: novosBlocos,
      dotacao: texto,
      caminhoImagemDotacao: "",
    });
  };

  const fatorVigencia = (unidade: string) => unidade === "Dias" ? 1 : unidade === "Ano(s)" ? 365 : unidade.toLocaleLowerCase("pt-BR").startsWith("sem") ? 7 : 30;
  const maxVigencia = (unidade: string) => Math.floor(365 / fatorVigencia(unidade));
  const vigenciaAtual = Math.max(1, Number(dados.vigenciaNum) || 1);
  const vigenciaMaxima = maxVigencia(String(dados.vigenciaUnidade || "Meses"));

  const decrementarVigencia = (e: React.MouseEvent) => {
    e.preventDefault();
    atualizarDados((anterior: any) => ({ vigenciaNum: Math.max(1, (Number(anterior.vigenciaNum) || 1) - 1) }));
  };

  const incrementarVigencia = (e: React.MouseEvent) => {
    e.preventDefault();
    atualizarDados((anterior: any) => ({
      vigenciaNum: Math.min(maxVigencia(String(anterior.vigenciaUnidade || "Meses")), (Number(anterior.vigenciaNum) || 1) + 1),
    }));
  };

  const alterarUnidadeVigencia = (unidade: string) => {
    atualizarDados((anterior: any) => ({
      vigenciaUnidade: unidade,
      vigenciaNum: Math.min(Math.max(1, Number(anterior.vigenciaNum) || 1), maxVigencia(unidade)),
    }));
  };

  const lotes = obterLotes(dados);
  const temLote = lotes.length > 0;
  const faltaDotacao =
    (!String(dados.dotacao || "").trim()) &&
    !blocosDotacao.some(
      (bloco) =>
        (bloco.tipo === "imagem" && !!bloco.imagemBase64) ||
        (bloco.tipo === "texto" && String(bloco.texto || "").trim())
    );
  const totalGeral = calcularValorEstimadoItens(dados.itens || []);
  const meeppExclusivoPermitido = exclusividadeMeeppPermitida(dados.itens || []);
  const totalAcimaDoLimite = totalGeral > LIMITE_EXCLUSIVIDADE_MEEPP;
  const valorEstimadoFormatado = totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  React.useEffect(() => {
    if (temLote && dados.criterio !== "LOTE") {
      atualizarDados({ criterio: "LOTE" });
    } else if (!temLote && dados.criterio === "LOTE") {
      atualizarDados({ criterio: "ITEM", motivoCriterio: "" });
    }
  }, [temLote, dados.criterio, atualizarDados]);

  React.useEffect(() => {
    if (!meeppExclusivoPermitido && dados.meepp === "SIM") {
      atualizarDados({ meepp: "NAO" });
    }
  }, [meeppExclusivoPermitido, dados.meepp, atualizarDados]);

  return (
    <div className="step-form step-form--settings step5-form">
      <div className="setting-section step5-section">
        <h2 className="step5-title">Tipo de Instrumento</h2>
        <fieldset className="setting-options step5-options">
          <legend className="sr-only">Tipo de Instrumento</legend>
          <RadioOption 
            name="instrumento" label="CONTRATO (Certeza da quantidade)" 
            value="CONTRATO" 
            checked={dados.instrumento === "CONTRATO"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: dados.prorrogar })} 
          />
          <RadioOption 
            name="instrumento" label="ATA DE REGISTRO DE PREÇOS (Sem certeza da quantidade)" 
            value="ATA" 
            checked={dados.instrumento === "ATA"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: dados.prorrogar })} 
          />
          <RadioOption 
            name="instrumento" label="SEM CONTRATO (Dispensa pequeno valor)" 
            value="SEM_CONTRATO" 
            checked={dados.instrumento === "SEM_CONTRATO"} 
            onChange={(e: any) => atualizarDados({ instrumento: e.target.value, prorrogar: false })} 
          />
        </fieldset>
        <label className={"step5-checkbox-label" + (dados.instrumento === "SEM_CONTRATO" ? " is-disabled" : "")}>
          <input 
            type="checkbox" 
            checked={dados.prorrogar} 
            disabled={dados.instrumento === "SEM_CONTRATO"}
            onChange={(e) => atualizarDados({ prorrogar: e.target.checked })}
            className="step5-radio-input"
          />
          <span className="step5-label-text">Permitir prorrogação?</span>
        </label>
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title">Participação ME/EPP</h2>
        <fieldset className="setting-options step5-options">
          <legend className="sr-only">Participação ME/EPP</legend>
          <RadioOption 
            name="meepp" label={`Exclusiva para ME/EPP (Até ${formatarLimiteMeepp()})`} 
            value="SIM" 
            checked={dados.meepp === "SIM"} 
            disabled={!meeppExclusivoPermitido}
            onChange={(e: any) => atualizarDados({ meepp: e.target.value })} 
          />
          <RadioOption 
            name="meepp" label={`Não Exclusiva (Maior que ${formatarLimiteMeepp()} ou ampla participação)`} 
            value="NAO" 
            checked={dados.meepp === "NAO"} 
            onChange={(e: any) => atualizarDados({ meepp: e.target.value })} 
          />
          {totalAcimaDoLimite && (
            <span className="step5-warning">
              A exclusividade integral para ME/EPP foi bloqueada porque o valor estimado desta contratação ({valorEstimadoFormatado}) supera o limite de {formatarLimiteMeepp()}.
            </span>
          )}
        </fieldset>
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title step5-title-compact">Critério de Julgamento</h2>
        <p className="step5-subtitle">
          {temLote
            ? `${lotes.length} ${lotes.length === 1 ? "lote criado" : "lotes criados"}. O critério é automaticamente definido como menor preço por lote.`
            : "Sem lotes cadastrados, você pode escolher menor preço por item ou menor preço global. A opção por lote permanece visível, mas bloqueada."}
        </p>
        <fieldset className="setting-options step5-options">
          <legend className="sr-only">Critério de Julgamento</legend>
          <RadioOption name="criterio" label="Menor preço por item" value="ITEM" checked={!temLote && dados.criterio === "ITEM"} disabled={temLote} onChange={() => { if (!temLote) atualizarDados({ criterio: "ITEM", motivoCriterio: "" }); }} />
          <RadioOption name="criterio" label="Menor preço global" value="GLOBAL" checked={!temLote && dados.criterio === "GLOBAL"} disabled={temLote} onChange={() => { if (!temLote) atualizarDados({ criterio: "GLOBAL" }); }} />
          <RadioOption name="criterio" label="Menor preço por lote" value="LOTE" checked={temLote} disabled={!temLote} onChange={() => { if (temLote) atualizarDados({ criterio: "LOTE" }); }} />
        </fieldset>

        {(temLote || (!temLote && dados.criterio === "GLOBAL")) && (
          <JustificationBox
            label={temLote ? "Justificativa do agrupamento em lotes" : "Justificativa para o menor preço global"}
            description={temLote
              ? "Explique com suas palavras por que estes itens devem ser reunidos. Uma frase simples é suficiente; a IA vai aprimorar a fundamentação no ETP."
              : "Explique brevemente por que a contratação deve ser julgada pelo valor global. A IA vai aprimorar a justificativa."}
            placeholder={temLote
              ? "Ex.: os itens pertencem à mesma categoria e podem ser fornecidos pelo mesmo mercado."
              : "Ex.: os itens são tecnicamente integrados e a contratação conjunta traz economia comprovável."}
            value={dados.motivoCriterio}
            onChange={(e: any) => atualizarDados({ motivoCriterio: e.target.value })}
            errorMsg="Informe uma justificativa simples para o critério escolhido."
            mostrarErro={tentouAvancar}
          />
        )}
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title step5-title-compact">Modalidade</h2>
        <p className="step5-subtitle">Regra geral da Lei 14.133/21: O Pregão Eletrônico é a modalidade obrigatória padrão.</p>
        <fieldset className="setting-options step5-options">
          <legend className="sr-only">Modalidade</legend>
          <RadioOption name="modalidade" label="Pregão Eletrônico" value="PREGAO_ELETRONICO" checked={dados.modalidade === "PREGAO_ELETRONICO"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption name="modalidade" label="Dispensa por e-mail" value="DISPENSA_EMAIL" checked={dados.modalidade === "DISPENSA_EMAIL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption name="modalidade" label="Dispensa com lances na BLL" value="DISPENSA_BLL" checked={dados.modalidade === "DISPENSA_BLL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
          <RadioOption name="modalidade" label="Pregão Presencial" value="PREGAO_PRESENCIAL" checked={dados.modalidade === "PREGAO_PRESENCIAL"} onChange={(e: any) => atualizarDados({ modalidade: e.target.value })} />
        </fieldset>

        {dados.modalidade !== "PREGAO_ELETRONICO" && (
          <JustificationBox 
            label={dados.modalidade === "PREGAO_PRESENCIAL" ? "Justificativa (Válido para municípios com até 20k habitantes até abril de 2027):" : "Justificativa (Atenção: Limite legal de até 65k ao todo ao longo do ano):"}
            value={dados.motivoModalidade}
            onChange={(e: any) => atualizarDados({ motivoModalidade: e.target.value })}
            errorMsg="Este campo é obrigatório." mostrarErro={tentouAvancar}
          />
        )}
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title">Vigência do Contrato/Ata (Máximo 1 ano)</h2>
        <div className="counter-wrapper step5-counter-wrapper">
          <button type="button" onClick={decrementarVigencia} disabled={vigenciaAtual <= 1} className="step5-counter-button">-</button>
          <input
            type="text"
            value={vigenciaAtual}
            readOnly
            aria-label={"Vigência em " + dados.vigenciaUnidade}
            className="step5-counter-input"
          />
          <button type="button" onClick={incrementarVigencia} disabled={vigenciaAtual >= vigenciaMaxima} className="step5-counter-button">+</button>
          <select 
            value={dados.vigenciaUnidade}
            onChange={(e) => alterarUnidadeVigencia(e.target.value)}
            className="step5-select"
          >
            <option value="Dias">Dias</option>
            <option value="Meses">Meses</option>
            <option value="Ano(s)">Ano(s)</option>
          </select>
          <span role="status" className="step5-limit-note">Máximo: {vigenciaMaxima} {dados.vigenciaUnidade || "Meses"} (365 dias).</span>
        </div>
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title step5-title-compact">Condições de Pagamento</h2>
        <p className="step5-subtitle-margin">
          Selecione a forma de pagamento. Nas opções padronizadas, o texto será aplicado diretamente, sem geração pela IA.
        </p>
        <select
          value={dados.pagamentoTipo || "CONFORME_ENTREGAS"}
          onChange={(e) => atualizarDados({ pagamentoTipo: e.target.value })}
          className="step5-select step5-select--flush"
        >
          <option value="CONFORME_ENTREGAS">CONFORME ENTREGAS</option>
          <option value="MENSALMENTE">MENSALMENTE</option>
          <option value="POR_ETAPAS">POR ETAPAS</option>
        </select>

        {dados.pagamentoTipo === "POR_ETAPAS" ? (
          <div className={"setting-justification step5-justification step5-justification--full" + (String(dados.pagamentoEtapas || "").trim() === "" ? " has-error" : "")}>
            <label className="step5-justification-title">
              Descreva como será o pagamento por etapas <span className="step5-asterisk">*</span>
            </label>
            <textarea
              value={dados.pagamentoEtapas || ""}
              onChange={(e) => atualizarDados({ pagamentoEtapas: e.target.value })}
              placeholder="Informe como será o pagamento, indicando as etapas e as respectivas condições de pagamento..."
              className={"step5-textarea step5-textarea--full" + (String(dados.pagamentoEtapas || "").trim() === "" ? " has-error" : "")}
            />
            {!String(dados.pagamentoEtapas || "").trim() && (
              <span className="step5-error">Este campo é obrigatório.</span>
            )}
            <span className="step5-subtitle-note">
              O texto informado será revisado pela IA antes de substituir {`{{PAGAMENTO}}`} no documento.
            </span>
          </div>
        ) : (
          <div className="step5-help-text">
            {dados.pagamentoTipo === "MENSALMENTE"
              ? "Pagamento será efetuado mensalmente, até o 10º dia útil após a prestação de serviços, emissão da Nota Fiscal e aceite pelo setor Contábil."
              : "Pagamento até o 10º dia útil após a entrega, emissão da Nota Fiscal e aceite pelo setor Contábil."}
          </div>
        )}
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title step5-title-compact">Prazo para Refazimento</h2>
        <p className="step5-subtitle-margin">
          Informe o prazo fixo para refazimento/correção, sempre em dias úteis. Este valor não é gerado nem alterado pela IA.
        </p>
        <div className="step5-days-control">
          <input
            type="number"
            min={1}
            step={1}
            value={dados.prazoRefazimentoDias ?? 5}
            onChange={(e) => {
              const valor = Number.parseInt(e.target.value, 10);
              atualizarDados({ prazoRefazimentoDias: Number.isFinite(valor) && valor > 0 ? valor : 1 });
            }}
            className="step5-counter-input step5-counter-input--days"
          />
          <span className="step5-days-label">dias úteis</span>
        </div>
      </div>
      <div className="setting-section step5-section">
        <h2 className="step5-title">
          Dotação Orçamentária <span className="step5-asterisk">*</span>
        </h2>
        <p className="step5-subtitle-margin">
          Digite a dotação e insira quantas imagens forem necessárias, na ordem em que devem aparecer no documento.
        </p>
        <DotacaoEditor
          value={blocosDotacao}
          onChange={atualizarBlocosDotacao}
          placeholder="Digite a dotação orçamentária..."
        />
        {faltaDotacao && <span className="step5-error">É obrigatório preencher a dotação ou inserir uma imagem.</span>}
      </div>

      <div className="setting-section step5-section">
        <h2 className="step5-title">Plano Anual de Contratações (PAC)</h2>
        <fieldset className="setting-options step5-options">
          <legend className="sr-only">Plano Anual de Contratações</legend>
          <RadioOption name="pac" label="Sim, previsto no PAC" value="SIM" checked={dados.pac === "SIM"} onChange={(e: any) => atualizarDados({ pac: e.target.value })} />
          <RadioOption name="pac" label="Não previsto no PAC" value="NAO" checked={dados.pac === "NAO"} onChange={(e: any) => atualizarDados({ pac: e.target.value })} />
        </fieldset>
        
        {dados.pac === "NAO" && (
          <JustificationBox 
            label="Justificativa para a não inclusão no PAC:"
            value={dados.motivoPac}
            onChange={(e: any) => atualizarDados({ motivoPac: e.target.value })}
            errorMsg="Este campo é obrigatório." mostrarErro={tentouAvancar}
          />
        )}
      </div>
    </div>
  );
}
