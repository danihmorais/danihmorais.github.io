import config

INSTRUMENTO_TEXTO = {
    "CONTRATO": "Contrato Administrativo",
    "ATA": "Ata de Registro de Preços",
    "SEM_CONTRATO": "Dispensa de Licitação (Pequeno Valor)",
}

MODALIDADE_TEXTO = {
    "PREGAO_ELETRONICO": "Pregão Eletrônico",
    "DISPENSA_EMAIL": "Dispensa Eletrônica por E-mail",
    "DISPENSA_BLL": "Dispensa Eletrônica com Lances (BLL)",
    "PREGAO_PRESENCIAL": "Pregão Presencial",
}

CRITERIOS_TEXTO = {
    "ITEM": "Menor Preço por Item",
    "GLOBAL": "Menor Preço Global",
    "LOTE": "Menor Preço por Lote",
}

MODALIDADE_TEXTO_LONGO = {
    "PREGAO_ELETRONICO": (
        "A modalidade de licitação adotada para o presente certame é o Pregão, em sua forma eletrônica, em estrita observância aos ditames da Lei nº 14.133/2021. Esta modalidade é a via obrigatória e mais adequada para a aquisição de bens e a contratação de serviços considerados comuns, ou seja, aqueles cujos padrões de desempenho e qualidade podem ser objetivamente definidos pelo edital, por meio de especificações usuais e reconhecidas pelo mercado.\n"
        "A adoção da forma eletrônica consolida o cumprimento dos princípios constitucionais da transparência, da impessoalidade, da moralidade e da isonomia, além de ampliar substancialmente o universo de potenciais licitantes, permitindo a participação de empresas sediadas em diversas regiões do país. O ambiente virtual e o sistema de disputa aberto, por meio de lances públicos e sucessivos, potencializam a obtenção da proposta mais vantajosa e econômica para os cofres públicos.\n"
        "Destaca-se, por fim, que o objeto detalhado neste documento enquadra-se de maneira inequívoca no conceito legal de bens e serviços comuns, prescindindo de avaliações técnicas de alta complexidade para sua seleção. Assim, o rito do pregão eletrônico garante maior celeridade processual, redução significativa de custos operacionais para a Administração e máxima eficiência na gestão da referida contratação."
    ),
    "DISPENSA_EMAIL": (
        "A presente contratação será realizada por meio de Contratação Direta, caracterizada como Dispensa de Licitação, instruída e conduzida com o recebimento de propostas e orçamentos via correio eletrônico (e-mail). Este formato ampara-se nas previsões de dispensa por limite de valor estabelecidas na Lei nº 14.133/2021, visando conferir agilidade necessária para suprir as demandas imediatas da Administração.\n"
        "A escolha desta modalidade simplificada justifica-se fundamentalmente pela relação custo-benefício. Trata-se de uma contratação de menor vulto econômico, na qual os custos administrativos e operacionais para a promoção de um certame licitatório formal superariam os eventuais benefícios econômicos auferidos, o que feriria frontalmente o princípio constitucional da eficiência.\n"
        "Ainda que dispensada a etapa competitiva padrão da licitação, o procedimento realizado via comunicação eletrônica assegura a lisura, a transparência e a impessoalidade da contratação. A pesquisa regular de mercado e o convite a múltiplos fornecedores garantem a obtenção da proposta mais vantajosa, respeitando a razoabilidade e a economicidade no emprego dos recursos públicos."
    ),
    "DISPENSA_BLL": (
        "A presente contratação será realizada por meio de Dispensa de Licitação, utilizando-se da forma eletrônica com etapa de lances. O procedimento fundamenta-se tecnicamente nos limites de valor previstos na legislação vigente (Lei nº 14.133/2021), mas agrega, de forma vantajosa, um sistema competitivo em ambiente virtual para a seleção da melhor e mais econômica proposta.\n"
        "A opção por inserir uma etapa de lances em um rito de dispensa de licitação reflete o compromisso com a busca incessante pela economicidade. Mesmo se tratando de contratação de menor valor, a abertura de disputa sistêmica permite que os fornecedores reduzam ativamente seus preços, maximizando o bom uso dos recursos públicos sem abrir mão da celeridade exigida na demanda em questão.\n"
        "Ademais, a utilização de um sistema eletrônico estruturado confere total rastreabilidade, transparência e segurança jurídica ao processo de contratação direta. O ambiente digital inibe conluios, estimula a participação de empresas de diversas regiões geográficas e padroniza os trâmites documentais exigidos pela Administração, conferindo solidez à contratação."
    ),
    "PREGAO_PRESENCIAL": (
        "A modalidade adotada para o presente certame é o Pregão na sua forma Presencial, em caráter excepcional e devidamente motivado, conforme permitem as diretrizes da Lei nº 14.133/2021. A adoção da forma presencial justifica-se pelas especificidades do objeto licitado ou pela inviabilidade técnica devidamente comprovada de se adotar a via eletrônica neste caso concreto.\n"
        "Esta modalidade garante a presença física dos licitantes e permite o debate em tempo real durante a etapa de lances, bem como a verificação física e imediata de documentação ou, quando for o caso, de amostras e elementos visuais essenciais para a qualificação técnica dos interessados. Tais características conferem segurança imediata ao pregoeiro e à sua respectiva equipe de apoio.\n"
        "Cumpre ressaltar que, apesar de não ocorrer em ambiente virtual, o pregão presencial obedece rigorosamente aos princípios da isonomia, da seleção da proposta mais vantajosa e da promoção do desenvolvimento nacional sustentável. O rito mantém o dinamismo na negociação direta de preços e garante a transparência do ato por meio da sessão pública aberta ao acompanhamento de qualquer cidadão."
    )
}

CRITERIOS_TEXTO_LONGO = {
    "ITEM": (
        "O critério de julgamento estabelecido para o presente certame é o de menor preço por item. A adoção desse critério atende perfeitamente à regra geral de parcelamento do objeto prevista na legislação de licitações, a qual visa dividir a contratação em tantas parcelas quantas se comprovarem técnica e economicamente viáveis, sempre respeitando a integridade da demanda.\n"
        "A divisão em itens individuais amplia significativamente a competitividade, permitindo a ampla participação de empresas de diferentes portes. Destaca-se, em especial, o fomento à participação de microempresas e empresas de pequeno porte (ME/EPP), que podem ofertar propostas para parcelas específicas que se adequem à sua real capacidade operacional e financeira, sem a barreira de assumir a totalidade do objeto.\n"
        "Além dos fatores de mercado, a adjudicação por item afasta juridicamente o risco de ocorrência do chamado \"jogo de planilhas\", impedindo que eventuais sobrepreços em itens secundários sejam compensados por descontos artificiais em outros produtos ou serviços. Dessa forma, a Administração garante que está adquirindo cada material pelo seu efetivo e mais justo valor de mercado."
    ),
    "GLOBAL": (
        "O critério de julgamento adotado para a presente contratação é o de menor preço global. Esta escolha, consubstanciada técnica e juridicamente, justifica-se pela natureza estritamente indissociável do objeto, cuja execução exige a manutenção de um padrão unificado, padronização sistêmica ou integração estrutural que inviabiliza de modo absoluto o seu parcelamento entre diferentes fornecedores.\n"
        "A aglutinação do objeto em um lote global é condição indispensável para resguardar a Administração Pública de graves riscos de descontinuidade técnica, quebra ou perda de garantia de fábrica, e sobretudo para evitar o conflito de responsabilidades na fase de execução contratual. A concentração da execução em uma única empresa garante compatibilidade total e facilita substancialmente as atividades de fiscalização e controle da avença.\n"
        "Importa frisar que, muito embora o parcelamento seja a regra do ordenamento jurídico, o critério global aqui adotado não frustra, em nenhuma medida, o caráter competitivo do certame. Pelo contrário, garante a economia de escala e seleciona de forma assertiva a empresa com real capacidade e robustez técnica para entregar a solução completa, revelando-se a estratégia mais segura e vantajosa."
    ),
    "LOTE": (
        "Para o processamento da presente licitação, optou-se fundamentadamente pela adoção do critério de julgamento de menor preço por lote (ou grupo de itens). Este critério representa o ponto de equilíbrio operacional ideal entre a necessidade técnica de manter itens correlatos unidos e a obrigação legal de promover a mais ampla competitividade através do parcelamento do objeto.\n"
        "A formação estruturada de lotes justifica-se tanto pela viabilidade econômica quanto pela indiscutível afinidade técnica entre os elementos agrupados. A separação desses mesmos itens de forma estritamente individualizada tenderia a desinteressar fornecedores potenciais devido ao baixo atrativo comercial de itens isolados, ou geraria custos logísticos e de transporte desproporcionais, encarecendo o valor final para a Administração.\n"
        "Assim, o agrupamento lógico otimiza a futura gestão contratual, centraliza e simplifica a logística de entrega para categorias afins de materiais ou serviços e minimiza os custos administrativos decorrentes do acompanhamento. Ao mesmo tempo, preserva a isonomia e a competitividade, permitindo que os licitantes disputem exatamente os blocos que integram seu legítimo escopo de atuação no mercado."
    )
}

CHAVES_RAW = {
    "RAW_EXECUCAO",
    "RAW_MOTIVO_CRITERIO",
    "RAW_MOTIVO_MODALIDADE",
    "RAW_PAC",
    "INSTRUCOES_EXTRAS",
    "REQUISITOS_ETP_ANTERIOR",
}

SIM_VALORES = {"sim", "s", "x", "true", "1"}
NAO_VALORES = {"não", "nao", "n", "", "false", "0"}


def _normalizar_sim_nao(valor) -> str:
    return str(valor).strip().casefold()


def _converter_para_sim(valor) -> bool:
    return _normalizar_sim_nao(valor) in SIM_VALORES


def _formatar_lista_assinaturas(nomes_str: str, cargos_str: str):
    nomes = [nome.strip() for nome in nomes_str.split(",") if nome.strip()]
    cargos = [cargo.strip() for cargo in cargos_str.split(",") if cargo.strip()]
    resultado = []
    for index, nome in enumerate(nomes):
        cargo = cargos[index] if index < len(cargos) else ""
        resultado.append(f"{nome} ({cargo})" if cargo else nome)
    return resultado


def montar_variaveis_fixas(dados_usuario: dict) -> dict:
    resultado = {}

    for chave, valor in dados_usuario.items():
        chave_limpa = chave.strip("{}")
        if chave_limpa in CHAVES_RAW or chave in CHAVES_RAW:
            continue
        resultado[chave] = valor
    
    amostra_opt = dados_usuario.get("{{AMOST}}", "nao")
    texto_amostra = config.TEXTOS.get("amostra_tr", "") if _converter_para_sim(amostra_opt) else ""
    resultado["{{AMOSTRA}}"] = texto_amostra
    resultado["{{AMOSTRA_TR}}"] = texto_amostra

    vistoria_opt = dados_usuario.get("{{VIST}}", "nao")
    texto_vistoria = config.TEXTOS.get("vistoria_tr", "") if _converter_para_sim(vistoria_opt) else ""
    resultado["{{VISTORIA}}"] = texto_vistoria
    resultado["{{VISTORIA_TR}}"] = texto_vistoria

    instrumento_raw = dados_usuario.get("{{INSTRUMENTO}}", "CONTRATO")
    resultado["{{INSTRUMENTO}}"] = INSTRUMENTO_TEXTO.get(instrumento_raw, instrumento_raw)

    modalidade_raw = dados_usuario.get("{{MODALIDADE}}", "PREGAO_ELETRONICO")
    resultado["{{MODALIDADE_NOME}}"] = MODALIDADE_TEXTO.get(modalidade_raw, modalidade_raw)
    resultado["{{MODALIDADE}}"] = MODALIDADE_TEXTO_LONGO.get(modalidade_raw, modalidade_raw)

    criterio_raw = dados_usuario.get("{{CRITERIOS}}", "ITEM")
    resultado["{{CRITERIOS_NOME}}"] = CRITERIOS_TEXTO.get(criterio_raw, criterio_raw)
    resultado["{{CRITERIOS}}"] = CRITERIOS_TEXTO_LONGO.get(criterio_raw, criterio_raw)

    prorroga = dados_usuario.get("{{PRORROGA}}", "NÃO")
    
    if instrumento_raw == "ATA":
        if _converter_para_sim(prorroga):
            clausula_prorroga = config.TEXTOS.get("clausula_ata", "")
            if not clausula_prorroga:
                clausula_prorroga = config.TEXTOS.get("clausula_padrao", "")
            texto_prorroga = "podendo ser prorrogado por igual período, nos termos do art. 84 da Lei Federal nº 14.133/2021"
            texto_prorroga_sn = "Sim"
        else:
            clausula_prorroga = ""
            texto_prorroga = "e será improrrogável"
            texto_prorroga_sn = "Não"
    else:
        if _converter_para_sim(prorroga):
            clausula_prorroga = config.TEXTOS.get("clausula_padrao", "")
            texto_prorroga = "podendo ser prorrogado por igual período, nos termos dos arts. 106 e 107 da Lei Federal nº 14.133/2021, e art. 68 do Decreto Municipal nº 2056/24"
            texto_prorroga_sn = "Sim"
        else:
            clausula_prorroga = ""
            texto_prorroga = "e será improrrogável"
            texto_prorroga_sn = "Não"
        
    resultado["{{PRORROGA_CLAUS}}"] = clausula_prorroga
    resultado["{{PRORROGA}}"] = texto_prorroga
    resultado["{{PRORROGA_SN}}"] = texto_prorroga_sn

    meepp = dados_usuario.get("{{ME_EPP}}", "NAO")
    if _converter_para_sim(meepp):
        texto_meepp = config.TEXTOS.get("meepp_exclusivo", "")
    else:
        texto_meepp = config.TEXTOS.get("meepp_nao_exclusivo", "")
    resultado["{{ME_EPP_TR}}"] = texto_meepp

    resultado["{{ME_EPP}}"] = (
        "Exclusiva para ME/EPP" if _converter_para_sim(meepp)
        else "Não exclusiva para ME/EPP"
    )

    gestores_str = dados_usuario.get("{{GESTOR}}", "")
    cargos_gestores_str = dados_usuario.get("{{GESTOR_CARGO}}", "")
    fiscais_str = dados_usuario.get("{{FISCAL}}", "")
    cargos_fiscais_str = dados_usuario.get("{{FISCAL_CARGO}}", "")

    assinaturas_blocos = []

    if gestores_str and gestores_str != "[Não informado]":
        nomes_g = [n.strip() for n in gestores_str.split(",") if n.strip()]
        cargos_g = [c.strip() for c in cargos_gestores_str.split(",") if c.strip()]
        for i, nome in enumerate(nomes_g):
            cargo = cargos_g[i] if i < len(cargos_g) else ""
            linha = f"\n\n\n____________________________\n{nome}"
            if cargo:
                linha += f"\n{cargo}\nGestor do Contrato\n\n\n"
            assinaturas_blocos.append(linha)

    if fiscais_str and fiscais_str != "[Não informado]":
        nomes_f = [n.strip() for n in fiscais_str.split(",") if n.strip()]
        cargos_f = [c.strip() for c in cargos_fiscais_str.split(",") if c.strip()]
        for i, nome in enumerate(nomes_f):
            cargo = cargos_f[i] if i < len(cargos_f) else ""
            linha = f"____________________________\n{nome}"
            if cargo:
                linha += f"\n{cargo}\nFiscal do Contrato\n\n\n"
            assinaturas_blocos.append(linha)

    resultado["{{ASSINATURAS}}"] = "\n\n".join(assinaturas_blocos) if assinaturas_blocos else ""
    resultado["{{GESTORES}}"] = (
        "; ".join(_formatar_lista_assinaturas(gestores_str, cargos_gestores_str))
        if gestores_str and gestores_str != "[Não informado]"
        else "[Não informado]"
    )

    return resultado


def filtrar_chaves_docx(dados: dict) -> dict:
    return {k: v for k, v in dados.items() if k.startswith("{{") and k.endswith("}}")}