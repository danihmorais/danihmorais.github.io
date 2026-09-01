import { gerarTextoOpenRouter } from '../llm';

const STAGE_CHAVES: Record<string, string[]> = {
    "DFD": ["OBJETO", "TIPO_OBJ", "JUSTIFICATIVA", "ESTIMATIVA_QUANTIDADES", "RESULTADOS_ESPERADOS"],
    "DFD_DIRETA": ["OBJETO", "TIPO_OBJ", "JUSTIFICATIVA", "ESTIMATIVA_QUANTIDADES", "RESULTADOS_ESPERADOS"],
    "ETP": [
        "REQUISITOS_ETP", "SUBCONTRATACAO_ETP", "ME_EPP_ETP", "JUSTIFICATIVA_PAC", "MERCADO", "SOLUCAO",
        "CRITERIOS_JUSTIFICATIVA_ETP", "CRITERIOS_SUSTENTABILIDADE", "MODALIDADE_JUSTIFICATIVA_ETP", "PROVIDENCIAS_CONT",
        "CORRELATAS_INTER", "JUSTIFICATIVA_ESTIMATIVA", "GARANTIAS_ETP", "VISTORIA_ETP", "AMOSTRA_ETP",
        "VALOR_ESTIMADO_APROXIMADO", "PARCELAMENTO", "CONCLUSAO"
    ],
    "TR": [
        "REQUISITOS_TR", "OBRIGACOES_CONTRATADA", "OBRIGACOES_CONTRANTE", "QUALIFICACAO_TECNICA", "GARANTIAS_TR",
        "EXECUCAO", "PRAZO_EXEC", "LOCAL", "AMOSTRA_TR"
    ],
};

const REGRAS_MINIMAS_TEXTO: Record<string, string> = {
    "JUSTIFICATIVA": "Entre 4 e 6 parágrafos com no mínimo 5 linhas cada, levando em consideração os aspectos legais, técnicos e econômicos, amparados pela CF/1988, sob o prisma do interesse público envolvido.",
    "ESTIMATIVA_QUANTIDADES": "Entre 1 e 2 parágrafos com fundamentação técnica e memória metodológica. Se não houver histórico informado, justifique com base em consumo, necessidade administrativa e dados disponíveis, sem inventar fontes.",
    "RESULTADOS_ESPERADOS": "Entre 3 e 4 parágrafos detalhando economicidade, eficiência, continuidade e interesse público.",
    "REQUISITOS_ETP": "Elabore requisitos técnicos, objetivos e proporcionais, evitando exigências excessivas.",
    "SUBCONTRATACAO_ETP": "Mínimo de 1 parágrafo justificando a solução adotada.",
    "ME_EPP_ETP": "Entre 3 e 4 parágrafos com fundamento na LC 123/2006.",
    "JUSTIFICATIVA_PAC": "Mínimo de 1 parágrafo.", "MERCADO": "Entre 3 e 5 parágrafos comparando soluções e práticas de mercado.",
    "SOLUCAO": "Entre 3 e 5 parágrafos focados na solução de contratação como um todo.", "CRITERIOS_JUSTIFICATIVA_ETP": "Entre 3 e 4 parágrafos.",
    "CRITERIOS_SUSTENTABILIDADE": "Entre 3 e 4 parágrafos.", "MODALIDADE_JUSTIFICATIVA_ETP": "Entre 4 e 5 parágrafos com fundamentação legal.",
    "PROVIDENCIAS_CONT": "Entre 2 e 4 parágrafos.", "CORRELATAS_INTER": "Mínimo de 1 parágrafo.", "JUSTIFICATIVA_ESTIMATIVA": "Mínimo de 1 parágrafo.",
    "GARANTIAS_ETP": "Entre 3 e 5 parágrafos.", "VISTORIA_ETP": "Mínimo de 1 parágrafo.", "AMOSTRA_ETP": "Mínimo de 1 parágrafo.",
    "CONCLUSAO": "Entre 3 e 4 parágrafos.", "REQUISITOS_TR": "Enumere documentos adicionais de habilitação, se houver.",
    "OBRIGACOES_CONTRATADA": "Entre 15 e 20 obrigações separadas por quebra de linha.", "OBRIGACOES_CONTRANTE": "Entre 10 e 15 obrigações separadas por quebra de linha.",
    "QUALIFICACAO_TECNICA": "Entre 3 e 4 parágrafos.", "GARANTIAS_TR": "Entre 2 e 3 parágrafos.", "TIPO_OBJ": "Reescreva as opções e marque com X a opção escolhida.",
    "PARCELAMENTO": "Entre 1 e 3 parágrafos.", "EXECUCAO": "Entre 4 e 6 parágrafos completos e operacionais.", "PRAZO_EXEC": "Texto completo contendo prazo por extenso e em algarismos.",
    "VALOR_ESTIMADO_APROXIMADO": "Informe apenas R$ XX,XX.", "LOCAL": "Entre 1 e 2 parágrafos completos.", "AMOSTRA_TR": "Entre 4 e 5 parágrafos, se aplicável."
};

function montarRegrasMinimas(chavesEtapa: string[], dadosUsuario: Record<string, string>, camposExcluidos: string[] = []): string {
    const valorEstimado = dadosUsuario["{{VALOR_ESTIMADO}}"] || "[valor não informado]";
    const requisitos = dadosUsuario["REQUISITOS_ETP_ANTERIOR"] || "Não informados.";
    return chavesEtapa.filter(c => REGRAS_MINIMAS_TEXTO[c] && !camposExcluidos.includes(c)).map(c => {
        let regra = REGRAS_MINIMAS_TEXTO[c].replace("{{VALOR_ESTIMADO}}", valorEstimado).replace("{{REQUISITOS_ETP_ANTERIOR}}", requisitos);
        return `- ${c}: ${regra}`;
    }).join("\n");
}

function construirPrompt(dadosUsuario: Record<string, string>, meeppExclusivo: boolean, etapa: string): string {
    const objeto = dadosUsuario["{{OBJETO}}"] || "";
    const necessidade = dadosUsuario["{{NECESSIDADE}}"] || "";
    const execucaoRaw = dadosUsuario["RAW_EXECUCAO"] || "";
    const instrucoesExtras = dadosUsuario["INSTRUCOES_EXTRAS"] || "";
    const modalidadeTipo = dadosUsuario["{{MODALIDADE}}"] || "";
    const fundamentoDireta = dadosUsuario["FUNDAMENTO_COMPRA_DIRETA"] || "";
    const amostraFormatada = ["sim", "s", "x"].includes((dadosUsuario["{{AMOST}}"] || "nao").toLowerCase()) ? "Sim" : "Não";
    const vistoriaFormatada = ["sim", "s", "x"].includes((dadosUsuario["{{VIST}}"] || "nao").toLowerCase()) ? "Sim" : "Não";
    const camposExcluidos: string[] = [];
    if (amostraFormatada === "Não") camposExcluidos.push("AMOSTRA_ETP", "AMOSTRA_TR");
    if (vistoriaFormatada === "Não") camposExcluidos.push("VISTORIA_ETP");

    const regrasGerais = `Você é especialista sênior em licitações e contratos administrativos para a Prefeitura de São Francisco - SP. Atue conforme a Lei Federal nº 14.133/2021, LC 123/2006, jurisprudência do TCU/TCE-SP e boas práticas de governança. Use linguagem técnica, formal, impessoal e juridicamente segura. Não invente fatos, valores, fontes, processos anteriores, dispositivos legais ou enquadramentos que não tenham sido informados.`;
    const base = `OBJETO: ${objeto}\nNECESSIDADE: ${necessidade}\nCONDIÇÕES INFORMADAS: ${execucaoRaw}\nMODALIDADE INFORMADA: ${modalidadeTipo}\nFUNDAMENTO DA COMPRA DIRETA INFORMADO: ${fundamentoDireta}`;

    let chaves = "";
    let diretriz = "";
    if (etapa === "DFD_DIRETA") {
        chaves = `{"OBJETO":"","TIPO_OBJ":"","JUSTIFICATIVA":"","ESTIMATIVA_QUANTIDADES":"","RESULTADOS_ESPERADOS":""}`;
        diretriz = `ETAPA ESPECIAL: DFD PARA COMPRA DIRETA / NOTA AVULSA.\nGere SOMENTE um DFD. Não gere ETP, TR ou edital. O DFD deve ser muito mais detalhado que um DFD convencional e conter, dentro dos campos disponíveis, conteúdo operacional suficiente para instruir uma compra direta: descrição precisa do objeto, finalidade, quantidades, especificações/características relevantes, condições de fornecimento/entrega, prazo, local, critérios objetivos de recebimento e controle de qualidade, necessidade de garantia/assistência quando pertinente, riscos de receber produto inadequado e justificativa de vantajosidade. O documento continua sendo formalmente um DFD; não o chame de TR.\nSe o fundamento legal específico não foi informado, NÃO invente artigo/inciso.\nNo OBJETO, seja preciso e inclua o Município de São Francisco/SP quando pertinente. Na JUSTIFICATIVA, explique também por que a contratação direta atende à necessidade e como a Administração deverá conferir o objeto antes do pagamento. Na ESTIMATIVA_QUANTIDADES, utilize os itens informados pelo usuário e seus quantitativos, sem criar itens. Em RESULTADOS_ESPERADOS, inclua economicidade, eficiência, continuidade, recebimento adequado e interesse público.`;
    } else if (etapa === "DFD") {
        chaves = `{"OBJETO":"","TIPO_OBJ":"","JUSTIFICATIVA":"","ESTIMATIVA_QUANTIDADES":"","RESULTADOS_ESPERADOS":""}`;
        diretriz = `ETAPA: DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA. O OBJETO deve ser preciso e mencionar o Município de São Francisco/SP. A JUSTIFICATIVA deve demonstrar necessidade, interesse público, impactos da não contratação e alinhamento ao planejamento.`;
    } else if (etapa === "ETP") {
        chaves = `{"REQUISITOS_ETP":"","SUBCONTRATACAO_ETP":"","ME_EPP_ETP":"","JUSTIFICATIVA_PAC":"","MERCADO":"","SOLUCAO":"","CRITERIOS_JUSTIFICATIVA_ETP":"","CRITERIOS_SUSTENTABILIDADE":"","MODALIDADE_JUSTIFICATIVA_ETP":"","PROVIDENCIAS_CONT":"","CORRELATAS_INTER":"","JUSTIFICATIVA_ESTIMATIVA":"","GARANTIAS_ETP":"","VISTORIA_ETP":"","AMOSTRA_ETP":"","VALOR_ESTIMADO_APROXIMADO":"","PARCELAMENTO":"","CONCLUSAO":""}`;
        diretriz = `ETAPA: ESTUDO TÉCNICO PRELIMINAR. Analise tecnicamente a solução, mercado, requisitos, sustentabilidade, parcelamento e modalidade.`;
    } else {
        chaves = `{"REQUISITOS_TR":"","OBRIGACOES_CONTRATADA":"","OBRIGACOES_CONTRANTE":"","QUALIFICACAO_TECNICA":"","GARANTIAS_TR":"","EXECUCAO":"","PRAZO_EXEC":"","LOCAL":"","AMOSTRA_TR":""}`;
        diretriz = `ETAPA: TERMO DE REFERÊNCIA. Produza conteúdo normativo e operacional, objetivo e proporcional ao objeto. ${execucaoRaw ? `Aprimore as condições informadas: ${execucaoRaw}` : "Elabore condições completas de execução."}`;
    }

    const regras = montarRegrasMinimas(STAGE_CHAVES[etapa] || [], dadosUsuario, camposExcluidos);
    const restricoes = `ATENÇÃO - SAÍDA RÍGIDA: retorne EXCLUSIVAMENTE JSON válido, sem markdown, sem comentários e sem texto fora do JSON. Nenhuma chave pode ficar vazia. Use \\n para quebras de linha dentro das strings.`;
    return `${regrasGerais}\n\n${base}\n\n${instrucoesExtras}\n\n${diretriz}\n\nREGRAS MÍNIMAS:\n${regras}\n\nESTRUTURA OBRIGATÓRIA:\n${chaves}\n\n${restricoes}`;
}

export async function processarDadosIA(dadosUsuario: Record<string, string>, apiKey: string, provider: string, meeppExclusivo: boolean, etapa: string, modelo: string): Promise<Record<string, string>> {
    const prompt = construirPrompt(dadosUsuario, meeppExclusivo, etapa);
    if (provider === "openrouter") return await gerarTextoOpenRouter(prompt, apiKey, modelo);
    throw new Error(`Provedor IA não suportado: ${provider}`);
}
