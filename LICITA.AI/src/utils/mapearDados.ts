export const mapearDadosWizard = (dados: any) => {
  const itens = dados.itens || [];
  const pagamentoTipo = String(dados.pagamentoTipo || "CONFORME_ENTREGAS").trim().toUpperCase();
  const pagamentoEtapas = String(dados.pagamentoEtapas || "").trim();
  const pagamentoPadrao = pagamentoTipo === "MENSALMENTE"
    ? "Pagamento será efetuado mensalmente, até o 10º dia útil após a prestação de serviços, emissão da Nota Fiscal e aceite pelo setor Contábil."
    : "Pagamento até o 10º dia útil após a entrega, emissão da Nota Fiscal e aceite pelo setor Contábil.";
  const pagamentoMapeado = pagamentoTipo === "POR_ETAPAS" ? pagamentoEtapas : pagamentoPadrao;
  const prazoRefazimentoDias = Math.max(1, Number.parseInt(String(dados.prazoRefazimentoDias ?? 5), 10) || 5);
  const totalItens = itens.reduce((acc: number, i: any) => acc + (Number(i.qtd || 0) * Number(i.valor || 0)), 0);
  const valorEstimadoFormatado = totalItens.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const itensNomes = itens
    .map((item: any, index: number) => ({
      numero: item?.numero ?? index + 1,
      nome: String(item?.descricao || '').trim(),
    }))
    .filter((item: any) => item.nome);
  
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
    "ITENS_NOMES": JSON.stringify(itensNomes),
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
    "{{PAGAMENTO}}": pagamentoMapeado,
    "PAGAMENTO_TIPO": pagamentoTipo,
    "PAGAMENTO_ETAPAS_RAW": pagamentoEtapas,
    "{{PRAZO REFAZIMENTO}}": `${prazoRefazimentoDias} dias úteis`,
    "{{DOTACAO}}": (() => {
      const blocos = Array.isArray(dados.dotacaoBlocos) ? dados.dotacaoBlocos : [];
      if (blocos.length > 0) {
        return blocos
          .map((bloco: any) => {
            if (bloco?.tipo === "imagem" && bloco.imagemBase64) return `__IMG__${bloco.imagemBase64}`;
            return String(bloco?.texto || "");
          })
          .filter((parte: string) => parte !== "")
          .join("\n");
      }
      return dados.dotacao || "";
    })(),
    "{{CAMINHO_IMAGEM_DOTACAO}}": !Array.isArray(dados.dotacaoBlocos) || dados.dotacaoBlocos.length === 0
      ? (dados.caminhoImagemDotacao ? `__IMG__${dados.caminhoImagemDotacao}` : "")
      : "",
    "INSTRUCOES_EXTRAS": dados.instrucoesExtras || "",
    "RAW_EXECUCAO": dados.execucao || "",
    "RAW_MOTIVO_CRITERIO": dados.motivoCriterio || "",
    "RAW_MOTIVO_MODALIDADE": dados.motivoModalidade || "",
    "RAW_PAC": dados.pac === "SIM" ? "Previsto no PAC" : `Não previsto: ${dados.motivoPac || 'sem justificativa'}`,
    "REQUISITOS_ETP_ANTERIOR": dados.requisitosEtpAnterior || "Não informados."
  };
};
