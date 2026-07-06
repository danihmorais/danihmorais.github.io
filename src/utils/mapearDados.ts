function numeroPorExtenso(numero: number): string {
  if (isNaN(numero)) return "";
  if (numero === 0) return "zero";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (numero === 100) return "cem";

  if (numero < 20) return unidades[numero];
  if (numero < 100) {
    const d = Math.floor(numero / 10);
    const u = numero % 10;
    return dezenas[d] + (u > 0 ? " e " + unidades[u] : "");
  }
  if (numero < 1000) {
    const c = Math.floor(numero / 100);
    const r = numero % 100;
    return centenas[c] + (r > 0 ? " e " + numeroPorExtenso(r) : "");
  }
  return numero.toString();
}

export const mapearDadosWizard = async (dados: any) => {
  let modalidadeFormatada = "";
  let arquivoBase = "";
  
  switch(dados.modalidade) {
    case "PREGAO_ELETRONICO":
      modalidadeFormatada = "Pregão Eletrônico";
      arquivoBase = "pregao_eletronico";
      break;
    case "PREGAO_PRESENCIAL":
      modalidadeFormatada = "Pregão Presencial";
      arquivoBase = "pregao_presencial";
      break;
    case "DISPENSA":
      modalidadeFormatada = "Dispensa";
      arquivoBase = "dispensa";
      break;
    case "DISPENSA_BLL":
      modalidadeFormatada = "Dispensa Eletrônica BLL";
      arquivoBase = "dispensa_bll";
      break;
    default:
      modalidadeFormatada = "Pregão Eletrônico";
      arquivoBase = "pregao_eletronico";
  }

  const gestoresNomes = (dados.gestores || []).map((g: any) => g.nome).join(", ");
  const gestoresCargos = (dados.gestores || []).map((g: any) => g.cargo).join(", ");
  
  const fiscaisNomes = (dados.fiscais || []).map((f: any) => f.nome).join(", ");
  const fiscaisCargos = (dados.fiscais || []).map((f: any) => f.cargo).join(", ");

  const qtdItens = Number(dados.quantidadeItens || 0);
  const itensFormatado = qtdItens > 0 ? `${qtdItens} (${numeroPorExtenso(qtdItens)})` : "";

  const qtdLotes = Number(dados.quantidadeLotes || 0);
  const lotesFormatado = qtdLotes > 0 ? `${qtdLotes} (${numeroPorExtenso(qtdLotes)})` : "";

  let docText = "";
  let docCount = 12;
  const docs = dados.documentosAdicionais || [];
  for (const doc of docs) {
    if (doc.trim()) {
      docText += `***(Documento ${docCount.toString().padStart(2, '0')})*** ${doc.trim()}\n`;
      docCount++;
    }
  }
  
  const declNum = docCount.toString().padStart(2, '0');
  const propNum = (docCount + 1).toString().padStart(2, '0');

  // Agora processamos MÚLTIPLAS imagens
  let dotacaoBase64List: string[] = [];
  let tipoDotacao = "TEXTO";

  if (dados.dotacaoImagens && dados.dotacaoImagens.length > 0) {
    tipoDotacao = "IMAGEM";
    for (const file of dados.dotacaoImagens) {
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = (error) => reject(error);
        });
        dotacaoBase64List.push(b64);
      } catch (e) {
        console.error("Erro ao converter imagem", e);
      }
    }
  }

  return {
    dadosMapeados: {
        "{{N.MODALIDADE}}": dados.numeroModalidade || "",
        "{{N.PROCESSO}}": dados.numeroProcesso || "",
        "{{OBJETO}}": dados.objeto || "",
        "{{CRITERIOS}}": dados.criterios || "ITEM",
        "{{INSTRUMENTO}}": dados.instrumento || "CONTRATO",
        "{{PRORROGACAO_CHECK}}": dados.prorrogacaoCheck || "NAO",
        "{{GESTOR}}": gestoresNomes,
        "{{GESTOR_CARGO}}": gestoresCargos,
        "{{FISCAL}}": fiscaisNomes,
        "{{FISCAL_CARGO}}": fiscaisCargos,
        "{{DATA DO EDITAL}}": dados.dataEdital || "",
        "{{DATA DA SESSAO}}": dados.dataSessao || "",
        "{{DATA REC PROP1}}": dados.dataRecProp1 || "",
        "{{HORA SESSAO}}": dados.horaSessao || "",
        "{{HORA_SESSAO}}": dados.horaSessao || "",
        "{{VALOR}}": dados.valor || "",
        "{{EXCLUSIVO}}": dados.exclusivo || "NAO",
        "{{ITENS}}": itensFormatado,
        "{{LOTE2}}": lotesFormatado,
        "{{DOCUMENTOS ADICIONAIS}}": docText,
        "{{DECL}}": declNum,
        "{{PROP}}": propNum,
        "{{MODALIDADE}}": dados.modalidade || "PREGAO_ELETRONICO",
        "{{MODALIDADE_NOME}}": modalidadeFormatada,
        "{{DECL.ADICIONAIS}}": dados.declAdicionais || "",
        "{{CONTRATANTE}}": dados.contratante || "",
        "{{CONTRATADA}}": dados.contratada || "",
        "{{EXECUCAO}}": dados.execucao || "",
        "{{PRAZO DEVOLUCAO}}": dados.prazoDevolucao || "",
        "{{ESPECIFICACOES ESPECIAIS}}": dados.especificacoesEspeciais || "",
        "{{VIGENCIA}}": dados.vigencia || "",
        "{{DOTACAO}}": dados.dotacao || "",
        "{{TIPO_OBJETO}}": dados.tipoObjeto || "AQUISICAO",
        "{{VISTORIA_CHECK}}": dados.vistoria ? "SIM" : "NAO",
        "{{VISTORIA_TXT}}": dados.textoVistoria || "",
        "{{AMOSTRA_CHECK}}": dados.amostra ? "SIM" : "NAO",
        "{{AMOSTRA_TXT}}": dados.textoAmostra || "",
        "{{ARQ_MAG_CHECK}}": dados.arquivoMagnetico && dados.modalidade === "PREGAO_PRESENCIAL" ? "SIM" : "NAO",
        "{{DFD}}": dados.arquivoDfd ? dados.arquivoDfd.path : "",
        "{{ETP}}": dados.arquivoEtp ? dados.arquivoEtp.path : "",
        "{{TR}}": dados.arquivoTr ? dados.arquivoTr.path : "",
        
        "{{TIPO_DOTACAO}}": tipoDotacao,
        "{{DOTACAO_BASE64_LIST}}": dotacaoBase64List,
    },
    arquivoBase: arquivoBase
  };
};