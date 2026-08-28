export const mapearDadosWizard = (dados: any) => {
  const itens = dados.itens || [];
  const totalItens = itens.reduce((acc: number, i: any) => acc + (Number(i.qtd || 0) * Number(i.valor || 0)), 0);
  const valorEstimadoFormatado = totalItens.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  let contatosStr = "";
  if (dados.contatosSecretarias && typeof dados.contatosSecretarias === 'object') {
    const partes = [];
    for (const [sec, contatos] of Object.entries(dados.contatosSecretarias)) {
      if (Array.isArray(contatos) && contatos.length > 0) {
        const listaContatos = contatos.map((c: any) => [c.email, c.tel].filter(Boolean).join(" - ")).join(", ");
        partes.push(`${sec} (${listaContatos})`);
      }
    }
    contatosStr = partes.join(" | ");
  }

  return {
    "{{OBJETO}}": dados.objeto || "",
    "{{NECESSIDADE}}": dados.necessidade || "",
    "{{ITENS}}": JSON.stringify(itens),
    "{{VALOR_ESTIMADO}}": valorEstimadoFormatado,
    "{{EXECUCAO}}": dados.execucao || "",
    "{{PAC}}": dados.pac === "SIM" ? "Previsto no PAC" : `Não previsto: ${dados.motivoPac || 'sem justificativa'}`,
    "{{INSTRUMENTO}}": dados.instrumento || "CONTRATO",
    "{{GESTOR}}": (dados.gestores || []).map((g: any) => g.nome).join(", ") || "[Não informado]",
    "{{GESTOR_CARGO}}": (dados.gestores || []).map((g: any) => g.cargo).join(", ") || "[Não informado]",
    "{{FISCAL}}": (dados.fiscais || []).map((f: any) => f.nome).join(", ") || "[Não informado]",
    "{{FISCAL_CARGO}}": (dados.fiscais || []).map((f: any) => f.cargo).join(", ") || "[Não informado]",
    "{{AMOST}}": dados.amostra ? "sim" : "nao",
    "{{VIST}}": dados.vistoria ? "sim" : "nao",
    "{{PRORROGA}}": dados.prorrogar ? "sim" : "nao",
    "{{ME_EPP}}": dados.meepp || "NAO",
    "{{CRITERIOS}}": dados.criterio || "ITEM",
    "{{MOTIVO_CRITERIO}}": dados.motivoCriterio || "",
    "{{MODALIDADE}}": dados.modalidade || "PREGAO_ELETRONICO",
    "{{MOTIVO_MODALIDADE}}": dados.motivoModalidade || "",
    "{{SECRETARIAS}}": Array.isArray(dados.secretarias) ? dados.secretarias.join(", ") : "",
    "{{CONTATOS_SECRETARIAS}}": contatosStr,
    "{{VIGENCIA}}": `${dados.vigenciaNum || 1} ${dados.vigenciaUnidade || 'Meses'}`,
    "{{DOTACAO}}": dados.dotacao || "",
    "{{CAMINHO_IMAGEM_DOTACAO}}": dados.caminhoImagemDotacao ? `__IMG__${dados.caminhoImagemDotacao}` : "",
    "INSTRUCOES_EXTRAS": dados.instrucoesExtras || "",
    "RAW_EXECUCAO": dados.execucao || "",
    "RAW_MOTIVO_CRITERIO": dados.motivoCriterio || "",
    "RAW_MOTIVO_MODALIDADE": dados.motivoModalidade || "",
    "RAW_PAC": dados.pac === "SIM" ? "Previsto no PAC" : `Não previsto: ${dados.motivoPac || 'sem justificativa'}`,
    "REQUISITOS_ETP_ANTERIOR": dados.requisitosEtpAnterior || "Não informados."
  };
};