import { gerarTextoGemini, gerarTextoOpenRouter } from '../llm';

const STAGE_CHAVES: Record<string, string[]> = {
    "DFD": [
        "OBJETO", "TIPO_OBJ", "JUSTIFICATIVA", "ESTIMATIVA_QUANTIDADES", "RESULTADOS_ESPERADOS"
    ],
    "ETP": [
        "REQUISITOS_ETP", "SUBCONTRATACAO_ETP", "ME_EPP_ETP", "JUSTIFICATIVA_PAC", "MERCADO",
        "SOLUCAO", "CRITERIOS_JUSTIFICATIVA_ETP", "CRITERIOS_SUSTENTABILIDADE",
        "MODALIDADE_JUSTIFICATIVA_ETP", "PROVIDENCIAS_CONT", "CORRELATAS_INTER",
        "JUSTIFICATIVA_ESTIMATIVA", "GARANTIAS_ETP", "VISTORIA_ETP", "AMOSTRA_ETP",
        "VALOR_ESTIMADO_APROXIMADO", "PARCELAMENTO", "CONCLUSAO"
    ],
    "TR": [
        "REQUISITOS_TR", "OBRIGACOES_CONTRATADA", "OBRIGACOES_CONTRANTE",
        "QUALIFICACAO_TECNICA", "GARANTIAS_TR", "EXECUCAO", "PRAZO_EXEC",
        "LOCAL", "AMOSTRA_TR"
    ],
};

const REGRAS_MINIMAS_TEXTO: Record<string, string> = {
    "JUSTIFICATIVA": "Entre 4 e 6 parágrafos com no mínimo 5 linhas cada, levando em consideração os aspectos legais, técnicos e econômicos, amparados pela CF/1988, sob o prisma do interesse público envolvido.",
    "ESTIMATIVA_QUANTIDADES": "Entre 1 e 2 parágrafos com fundamentação técnica e memória metodológica. Como você não sabe os itens, deve sempre tentar dizer que foi considerada a estimativa de quantidades do processo anterior mais recente, ou seja, do processo que tratou do mesmo objeto e que foi concluído mais recentemente. Caso não haja processo anterior, deve justificar a estimativa com base em dados de mercado, histórico de consumo, ou outras fontes confiáveis de informação.",
    "RESULTADOS_ESPERADOS": "Entre 3 e 4 parágrafos detalhando economicidade, eficiência, continuidade e interesse público.",
    "REQUISITOS_ETP": "Você deve elaborar requisitos técnicos, objetivos e proporcionais, evitando exigências excessivas de qualificação técnica. Já foi informado que serão solicitados toda a habilitação jurídica; técnica; fiscal, social e trabalhista; econômico-financeira, e ainda, demais declarações previstas na Lei 14.133/21. Assim, se for o caso, se concentre primeiro em declarações excepcionais que deveriam ser solicitar, e, depois, em documentos adicionais que deveriam ser solicitados, mas que não comprometam a competitividade. Se decidir algum, você deve justificar cada um deles, com pelo menos 1 parágrafo de fundamentação técnica, legal e administrativa para cada requisito adicional sugerido. Se não decidir por nenhum requisito adicional, você deve justificar tecnicamente a ausência de requisitos adicionais, reforçando a adequação dos requisitos previstos na Lei 14.133/21 para o caso concreto. Depois disso, deve considerar os requisitos necessários e suficientes à escolha da solução.",
    "SUBCONTRATACAO_ETP": "Mínimo de 1 parágrafo justificando, mas sempre será que não é permitido.",
    "ME_EPP_ETP": "Entre 3 e 4 parágrafos com fundamento na LC 123/2006.",
    "JUSTIFICATIVA_PAC": "Mínimo de 1 parágrafo caso estivesse previsto, caso contrário justificar excepcionalidade da contratação.",
    "MERCADO": "Entre 3 e 5 parágrafos comparando soluções e práticas de mercado.",
    "SOLUCAO": "Entre 3 e 5 parágrafos. Você deve focar na contratação como um todo, como a modalidade escolhida, o tipo de julgamento adotado, as condições de execução, a necessidade, o objeto, assistência técnica e garantias, e não abordar aspectos técnicos de itens específicos, que serão abordados posteriormente. O foco deve ser na solução de contratação como um todo, e não em aspectos técnicos de itens específicos.",
    "CRITERIOS_JUSTIFICATIVA_ETP": "Entre 3 e 4 parágrafos.",
    "CRITERIOS_SUSTENTABILIDADE": "Entre 3 e 4 parágrafos.",
    "MODALIDADE_JUSTIFICATIVA_ETP": "Entre 4 e 5 parágrafos com fundamentação legal.",
    "PROVIDENCIAS_CONT": "Entre 2 e 4 parágrafos. Fale sobre instrução de fiscais, planejamento de fiscalização, e demais providências relacionadas à fiscalização e controle da execução contratual, bem como à mitigação de riscos relacionadas à contratação e diálogo com a autoridade competente (Prefeito) para adoção de providências em caso de necessidade de revisão contratual, aplicação de sanções, ou outras medidas administrativas relacionadas à contratação.",
    "CORRELATAS_INTER": "Mínimo de 1 parágrafo. Quase sempre será não, a não ser que outra instrução tenha sido dada nas instruções extras.",
    "JUSTIFICATIVA_ESTIMATIVA": "Mínimo de 1 parágrafo, em complementação à ESTIMATIVA_QUANTIDADES, que será incluída após a tabela de itens.",
    "GARANTIAS_ETP": "Entre 3 e 5 parágrafos, um cada tipo de garantia, devendo abordar tanto a garantia contratual quanto a garantia de proposta, considerando aspectos de proporcionalidade, economicidade e segurança jurídica (devendo ter o viés de QUASE NUNCA pedir essas garantias) e por fim garantia no sentido de assistência técnica, suporte, manutenção, atualização, e demais aspectos relacionados à garantia de solução adequada ao longo da execução contratual, considerando o objeto da contratação.",
    "VISTORIA_ETP": "Mínimo de 1 parágrafo, podendo ser resumido caso se trate de aquisição de bens.",
    "AMOSTRA_ETP": "Mínimo de 1 parágrafo, podendo ser resumido caso se trate de prestação de serviços. Caso se tenha optado por exigir amostra, apenas justifique a exigência, sem detalhar as características técnicas da amostra, que serão abordadas posteriormente no termo de referência.",
    "CONCLUSAO": "Entre 3 e 4 parágrafos.",
    "REQUISITOS_TR": "Você deve apenas enumerar cada um dos documentos adicionais solicitados nos REQUISITOS_ETP, separadamente, em ordem crescente, a partir do Documento 13, sempre colocando no formato (Documento XX) Yyyyyyyyyyyyyyyyyyyyy, em que XX é o número do documento adicional sugerido, e Yyyyyyyyyyyyyyyyyyyyy é o nome do documento sugerido. Se não houver nenhum documento adicional sugerido, escreva 'Não há documentos adicionais'. Documentos sugeridos no ETP: {{REQUISITOS_ETP_ANTERIOR}}",
    "OBRIGACOES_CONTRATADA": "Entre 15 e 20 obrigações separadas obrigatoriamente pelo caractere escapado de quebra de linha.",
    "OBRIGACOES_CONTRANTE": "Entre 10 e 15 obrigações separadas obrigatoriamente pelo caractere escapado de quebra de linha.",
    "QUALIFICACAO_TECNICA": "Entre 3 e 4 parágrafos.",
    "GARANTIAS_TR": "Entre 2 e 3 parágrafos. Deve ser um resumo de GARANTIAS_ETP",
    "TIPO_OBJ": "( ) Serviço não continuado\\n( ) Serviço continuado SEM dedicação exclusiva de mão de obra\\n( ) Serviço continuado COM dedicação exclusiva de mão de obra\\n( ) Material de Consumo\\n( ) Material Permanente/Equipamento\\n\\nReescreva as opções e insira um X na opção escolhida.",
    "PARCELAMENTO": "Entre 1 e 3 parágrafos. Você deve analisar a possibilidade de parcelamento da contratação, considerando aspectos como economicidade, eficiência, vantajosidade, planejamento, e jurisprudência do TCU sobre o tema. Considere a opção escolhida e detalhe a forma de parcelamento (parcelamento por item, por lote, ou outro critério), justificando tecnicamente a escolha do critério de parcelamento escolhido. Reforce os aspectos de economicidade, eficiência, vantajosidade e planejamento envolvidos, independente da opção escolhida.",
    "EXECUCAO": "Entre 4 e 6 parágrafos. Você deve aprimorar o texto base fornecido, detalhando condições de execução, prazos, cronogramas, etapas, e demais aspectos operacionais relevantes para a execução contratual. Não permita prazos de entrega inexequíveis ou condições de execução genéricas. O texto deve ser completo, detalhado e operacional, garantindo clareza e exequibilidade.",
    "PRAZO_EXEC": "Texto completo contendo prazo por extenso e em algarismos.",
    "VALOR_ESTIMADO_APROXIMADO": "Calcule algum valor aproximado a {{VALOR_ESTIMADO}}, considerando o objeto, a necessidade, as condições de execução, o mercado, a solução adotada e demais aspectos relevantes. O valor deve ser apresentado por extenso e em algarismos, e deve ser justificado com base em dados de mercado, histórico de consumo, ou outras fontes confiáveis de informação. Deve ser informado apenas o R$ XX,XX",
    "LOCAL": "Entre 1 e 2 parágrafos completos. Sempre será em algum endereço do Município de São Francisco/SP, mas detalhe o local de entrega ou execução, considerando aspectos logísticos e operacionais relevantes para a contratação. Horário quase sempre das 08h às 11h ou das 13h às 17h, salvo se outro tiver sido informado nas condições de execução.",
    "AMOSTRA_TR": "Entre 4 e 5 parágrafos, detalhando a parte prática da exigência de amostra, como a forma de apresentação, as características técnicas a serem observadas, o processo de avaliação da amostra, e demais aspectos operacionais relacionados à exigência de amostra. Caso se trate de prestação de serviços, o texto pode ser mais resumido, mas ainda assim deve detalhar a parte prática da exigência de amostra, como a forma de apresentação, o processo de avaliação da amostra, e demais aspectos operacionais relacionados à exigência de amostra. Deve se basear mais ou menos nisso: Deverão ser entregues amostras de todos os itens pelos licitantes provisoriamente vencedores no prazo máximo de 07 (sete) dias úteis, contadas da data de convocação via e-mail, que serão testadas e avaliadas pela comissão de avaliação definida pelo Departamento de XXXXXXXXX. As amostras postadas por correio ou transportadora não serão aceitas fora do prazo, e, desta maneira, a empresa que necessitar do envio por esses meios, deve ter o cuidado de enviar em tempo hábil, vez que o prazo máximo de entrega é extremamente razoável. Os itens deverão ser entregues em sua embalagem ORIGINAL da marca que for cotada pelo licitante. As amostras deverão ser entregues, junto ao Setor de Licitação na Prefeitura Municipal, no endereço Av. Oscar Antônio da Costa, 1187, CEP 15710-011, São Francisco/SP, qual seja das 8h às 11h e 13h às 17h. A empresa participante que não realizar a entrega das amostras dentro do prazo concedido será desclassificada dos itens que necessitam de apresentação de amostra. Serão exigidos como critério de avaliação aquilo que consta do descritivo de cada item, e avaliados por comissão de avaliação, qual seja: {{FISCAL}}, {{FISCAL_CARGO}}; {{GESTOR}}, {{GESTOR_CARGO}}.",
};

function montarRegrasMinimas(chavesEtapa: string[], dadosUsuario: Record<string, string>, camposExcluidos: string[] = []): string {
    const valorOriginal = dadosUsuario["{{VALOR_ESTIMADO}}"];
    const valorEstimado = valorOriginal ? valorOriginal : "[valor não informado — estime com base no mercado]";
    const requisitosEtpAnterior = dadosUsuario["REQUISITOS_ETP_ANTERIOR"] || "Não informados.";

    return chavesEtapa
        .filter(chave => REGRAS_MINIMAS_TEXTO[chave] && !camposExcluidos.includes(chave))
        .map(chave => {
            let regra = REGRAS_MINIMAS_TEXTO[chave];
            regra = regra.replace("{{VALOR_ESTIMADO}}", valorEstimado);
            regra = regra.replace("{{REQUISITOS_ETP_ANTERIOR}}", requisitosEtpAnterior);
            return `- ${chave}: ${regra}`;
        })
        .join("\n");
}

function construirPrompt(dadosUsuario: Record<string, string>, meeppExclusivo: boolean, etapa: string): string {
    const objeto = dadosUsuario["{{OBJETO}}"] || "";
    const execucaoRaw = dadosUsuario["RAW_EXECUCAO"] || "";
    const instrucoesExtras = dadosUsuario["INSTRUCOES_EXTRAS"] || "";
    const exclusividadeTexto = meeppExclusivo ? "Sim" : "Não";
    const necessidade = dadosUsuario["{{NECESSIDADE}}"] || "";
    const criterioTipo = dadosUsuario["{{CRITERIOS}}"] || "ITEM";
    const motivoCriterioRaw = dadosUsuario["RAW_MOTIVO_CRITERIO"] || "";
    const modalidadeTipo = dadosUsuario["{{MODALIDADE}}"] || "PREGAO_ELETRONICO";
    const motivoModalidadeRaw = dadosUsuario["RAW_MOTIVO_MODALIDADE"] || "";
    const pacRaw = dadosUsuario["RAW_PAC"] || "";
    const instrumento = dadosUsuario["{{INSTRUMENTO}}"] || "";
    const vigencia = dadosUsuario["{{VIGENCIA}}"] || "";
    const secretaria = dadosUsuario["{{SECRETARIAS}}"] || "";
    
    const amostraOpt = (dadosUsuario["{{AMOST}}"] || "nao").toLowerCase();
    const vistoriaOpt = (dadosUsuario["{{VIST}}"] || "nao").toLowerCase();
    const amostraFormatada = ["sim", "s", "x"].includes(amostraOpt) ? "Sim" : "Não";
    const vistoriaFormatada = ["sim", "s", "x"].includes(vistoriaOpt) ? "Sim" : "Não";

    const camposExcluidos: string[] = [];
    if (amostraFormatada === "Não") {
        camposExcluidos.push("AMOSTRA_ETP", "AMOSTRA_TR");
    }
    if (vistoriaFormatada === "Não") {
        camposExcluidos.push("VISTORIA_ETP");
    }

    const regrasGerais = `Você é um especialista sênior em licitações e contratos administrativos para a Prefeitura de São Francisco - SP.
Atue conforme a Lei Federal nº 14.133/2021, jurisprudência consolidada do TCU, jurisprudência do TCE-SP, doutrina majoritária e boas práticas de governança pública.
Os textos devem possuir linguagem técnica, formal, impessoal, jurídica e administrativa.
Não gere textos genéricos, superficiais ou resumidos.
Os textos devem possuir fundamentação técnica robusta, coerência lógica e profundidade argumentativa.
Priorize ampla competitividade, economicidade, eficiência, planejamento, motivação administrativa, segregação de funções, vantajosidade e segurança jurídica.
Observe especialmente: Lei 14.133/2021; LC 123/2006; Súmulas e jurisprudência do TCU; Jurisprudência do TCE-SP; Boas práticas de governança e planejamento das contratações públicas.
Evite exigências restritivas ou cláusulas potencialmente limitadoras da competitividade.
Os textos devem ser completos, extensos e aprofundados.`;

    let basePrompt = `OBJETO BASE DA CONTRATAÇÃO: ${objeto}
NECESSIDADE ADMINISTRATIVA: ${necessidade}
CONDIÇÕES DE EXECUÇÃO INFORMADAS: ${execucaoRaw}
EXCLUSIVIDADE ME/EPP: ${exclusividadeTexto}
CRITÉRIO DE JULGAMENTO: ${criterioTipo}
MODALIDADE INFORMADA: ${modalidadeTipo}
SITUAÇÃO DO PAC: ${pacRaw}
INSTRUMENTO: ${instrumento}
VIGÊNCIA: ${vigencia}
SECRETARIA/SETOR SOLICITANTE: ${secretaria}`;

    if (instrucoesExtras) {
        basePrompt += `\n\nINSTRUÇÕES COMPLEMENTARES OBRIGATÓRIAS:\n${instrucoesExtras}`;
    }

    let chaves = "{}";
    let diretrizEtapa = "";

    if (etapa === "DFD") {
        chaves = `{\n  "OBJETO": "",\n  "TIPO_OBJ": "",\n  "JUSTIFICATIVA": "",\n  "ESTIMATIVA_QUANTIDADES": "",\n  "RESULTADOS_ESPERADOS": ""\n}`;
        diretrizEtapa = `ETAPA: DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA.
O OBJETO deve:
1 - Se o instrumento for ARP, iniciar obrigatoriamente com 'Registro de preços para futura e eventual aquisição'.
2 - Para aquisições comuns sem ARP, iniciar com 'Aquisição'.
3 - Para serviços, iniciar com 'Contratação de empresa especializada'.
4 - Informar obrigatoriamente o Município de São Francisco/SP.
5 - Informar vigência e secretaria/setor destinatário (ou 'diversos setores da Administração Municipal').
6 - Caso haja convênio, recurso vinculado ou programa governamental, mencionar expressamente.
A JUSTIFICATIVA deve conter motivação administrativa detalhada, demonstração do interesse público, necessidade institucional, impactos da não contratação, alinhamento ao planejamento e continuidade administrativa.`;
    } else if (etapa === "ETP") {
        chaves = `{\n  "REQUISITOS_ETP": "",\n  "SUBCONTRATACAO_ETP": "",\n  "ME_EPP_ETP": "",\n  "JUSTIFICATIVA_PAC": "",\n  "MERCADO": "",\n  "SOLUCAO": "",\n  "CRITERIOS_JUSTIFICATIVA_ETP": "",\n  "CRITERIOS_SUSTENTABILIDADE": "",\n  "MODALIDADE_JUSTIFICATIVA_ETP": "",\n  "PROVIDENCIAS_CONT": "",\n  "CORRELATAS_INTER": "",\n  "JUSTIFICATIVA_ESTIMATIVA": "",\n  "GARANTIAS_ETP": "",\n  "VISTORIA_ETP": "",\n  "AMOSTRA_ETP": "",\n  "VALOR_ESTIMADO_APROXIMADO": "",\n  "PARCELAMENTO": "",\n  "CONCLUSAO": ""\n}`;
        
        const diretrizCriterio = criterioTipo === "ITEM" 
            ? "Na justificativa de parcelamento, priorize adjudicação por item como regra geral para ampliar competitividade, conforme jurisprudência do TCU." 
            : motivoCriterioRaw 
                ? `Utilize como motivação técnica do agrupamento/lote: ${motivoCriterioRaw}` 
                : "Justifique tecnicamente a adoção de lote considerando compatibilidade técnica e economicidade.";
        
        let diretrizModalidade = "";
        if (modalidadeTipo === "PREGAO_ELETRONICO") {
            diretrizModalidade = "Justifique a adoção do Pregão Eletrônico como modalidade preferencial para bens e serviços comuns, priorizando competitividade e transparência.";
        } else if (["DISPENSA_EMAIL", "DISPENSA_BLL"].includes(modalidadeTipo)) {
            diretrizModalidade = motivoModalidadeRaw 
                ? `Justifique tecnicamente a contratação direta utilizando como base: ${motivoModalidadeRaw}`
                : "Justifique tecnicamente a contratação direta excepcional.";
        } else if (modalidadeTipo === "PREGAO_PRESENCIAL") {
            diretrizModalidade = motivoModalidadeRaw
                ? `Justifique a excepcionalidade do pregão presencial utilizando como base: ${motivoModalidadeRaw}`
                : "Justifique a excepcionalidade da adoção do pregão presencial.";
        }

        const instrucaoAmostraEtp = amostraFormatada === "Não"
            ? `AMOSTRA_ETP: Retorne exatamente e exclusivamente a frase "Não há necessidade de exigência de amostra para esta contratação, justificando tecnicamente a desnecessidade e ausência de risco relevante."`
            : `AMOSTRA_ETP: Detalhe a exigência de amostra conforme as regras mínimas estabelecidas.`;

        const instrucaoVistoriaEtp = vistoriaFormatada === "Não"
            ? `VISTORIA_ETP: Retorne exatamente e exclusivamente a frase "Não há necessidade de exigência de vistoria prévia para esta contratação, justificando tecnicamente a desnecessidade."`
            : `VISTORIA_ETP: Detalhe a exigência de vistoria prévia.`;

        diretrizEtapa = `ETAPA: ESTUDO TÉCNICO PRELIMINAR.
Todos os textos devem possuir análise técnica aprofundada utilizando fundamentos legais, técnicos e administrativos.
Para ME/EPP, observar LC 123/2006 e jurisprudência aplicável.
Para PAC, se não houver previsão, justificar excepcionalidade da contratação.
Para sustentabilidade, abordar impactos ambientais, logística reversa, descarte, durabilidade, eficiência e sustentabilidade econômica.

INSTRUÇÕES CONDICIONAIS DIRETAS:
${instrucaoAmostraEtp}
${instrucaoVistoriaEtp}
${diretrizCriterio}
${diretrizModalidade}`;
    } else if (etapa === "TR") {
        chaves = `{\n  "REQUISITOS_TR": "",\n  "OBRIGACOES_CONTRATADA": "",\n  "OBRIGACOES_CONTRANTE": "",\n  "QUALIFICACAO_TECNICA": "",\n  "GARANTIAS_TR": "",\n  "EXECUCAO": "",\n  "PRAZO_EXEC": "",\n  "LOCAL": "",\n  "AMOSTRA_TR": ""\n}`;
        
        const diretrizExecucao = (execucaoRaw && execucaoRaw !== "[Condições de execução não informadas]") 
            ? `O campo EXECUCAO deve obrigatoriamente aprimorar o seguinte texto base: ${execucaoRaw}` 
            : "Elabore condições completas de execução compatíveis com o objeto.";
        
        const instrucaoAmostraTr = amostraFormatada === "Não"
            ? `AMOSTRA_TR: Retorne expressamente e exclusivamente a frase "Não há exigência de amostra para esta contratação."`
            : `AMOSTRA_TR: Detalhe a parte prática da exigência de amostra conforme as regras mínimas.`;

        diretrizEtapa = `ETAPA: TERMO DE REFERÊNCIA.
Os textos devem possuir caráter normativo e operacional.
Os requisitos devem ser objetivos, proporcionais e compatíveis com o objeto. É vedada exigência excessiva de qualificação técnica.
Observe jurisprudência do TCE-SP, especialmente TC-017136.989.25-8.

INSTRUÇÕES CONDICIONAIS DIRETAS:
${instrucaoAmostraTr}
${diretrizExecucao}`;
    }

    const chavesEtapa = STAGE_CHAVES[etapa] || [];
    const regrasMinimas = montarRegrasMinimas(chavesEtapa, dadosUsuario, camposExcluidos);

    const restricoesJSON = `ATENÇÃO - REGRAS RÍGIDAS DE SAÍDA:
1. Você deve retornar EXCLUSIVAMENTE um objeto JSON válido. Não adicione nenhum texto explicativo, saudações ou comentários antes ou depois do JSON.
2. NÃO USE marcadores de bloco de código (como \`\`\`json ou \`\`\`). Retorne o JSON diretamente em formato de texto puro.
3. ESCAPE DE QUEBRAS DE LINHA: O JSON não suporta quebras de linha literais dentro de strings. Para formatar quebras de linha dentro dos textos de cada chave, você DEVE utilizar obrigatoriamente os caracteres escapados \\n.
4. Nenhuma chave do JSON pode estar vazia.`;

    return `${regrasGerais}\n\n${basePrompt}\n\n${diretrizEtapa}\n\nREGRAS MÍNIMAS OBRIGATÓRIAS DE TAMANHO E PROFUNDIDADE:\n${regrasMinimas}\n\nESTRUTURA JSON OBRIGATÓRIA:\n${chaves}\n\n${restricoesJSON}`;
}

export async function processarDadosIA(
    dadosUsuario: Record<string, string>, 
    apiKey: string, 
    provider: string, 
    meeppExclusivo: boolean, 
    etapa: string,
    modelo: string
): Promise<Record<string, string>> {
    const prompt = construirPrompt(dadosUsuario, meeppExclusivo, etapa);

    if (provider === "openrouter") {
        return await gerarTextoOpenRouter(prompt, apiKey, modelo);
    } else if (provider === "gemini") {
        return await gerarTextoGemini(prompt, apiKey, modelo);
    } else {
        throw new Error(`Provedor IA não suportado: ${provider}`);
    }
}