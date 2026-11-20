from __future__ import annotations

import json
import re
from datetime import datetime, timezone

CAMPOS_DOCUMENTOS = {
    "DFD": ("OBJETO", "TIPO_OBJ", "JUSTIFICATIVA", "ESTIMATIVA_QUANTIDADES", "RESULTADOS_ESPERADOS"),
    "ETP": (
        "REQUISITOS_ETP", "SUBCONTRATACAO_ETP", "ME_EPP_ETP", "JUSTIFICATIVA_PAC", "MERCADO",
        "SOLUCAO", "CRITERIOS_JUSTIFICATIVA_ETP", "CRITERIOS_SUSTENTABILIDADE",
        "MODALIDADE_JUSTIFICATIVA_ETP", "PROVIDENCIAS_CONT", "CORRELATAS_INTER",
        "JUSTIFICATIVA_ESTIMATIVA", "GARANTIAS_ETP", "VISTORIA_ETP", "AMOSTRA_ETP",
        "PARCELAMENTO", "CONCLUSAO",
    ),
    "TR": (
        "REQUISITOS_TR", "OBRIGACOES_CONTRATADA", "OBRIGACOES_CONTRANTE",
        "QUALIFICACAO_TECNICA", "GARANTIAS_TR", "EXECUCAO", "PRAZO_EXEC", "LOCAL", "AMOSTRA_TR",
    ),
}

PLACEHOLDER_RE = re.compile(r"(?i)\{\{[^{}]+\}\}|\bX{3,}\b|\[(?:inserir|preencher|definir|informar)[^\]]*\]")
CITACAO_RE = re.compile(r"(?i)\b(?:art\.?|artigo|lei\s*(?:n[ºo.]?\s*)?|decreto(?:-lei)?\s*(?:n[ºo.]?\s*)?|s[uú]mula|portaria\s*(?:n[ºo.]?\s*)?|instru[cç][aã]o\s+normativa\s*(?:n[ºo.]?\s*)?|resolu[cç][aã]o\s*(?:n[ºo.]?\s*)?|ac[oó]rd[aã]o|processo)\s*\d")
DOCUMENTO_NUMERO_RE = re.compile(r"(?i)\bdocumento\s*(?:n[ºo.]?\s*)?(\d{1,3})\b")
NUMERO_RE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\d+(?:[.,]\d+)?%?")


def _texto(valor) -> str:
    if isinstance(valor, str):
        return valor.strip()
    if valor is None:
        return ""
    return str(valor).strip()


def _documentos_normalizados(documentos: dict) -> dict[str, dict]:
    if all(isinstance(documentos.get(nome), dict) for nome in CAMPOS_DOCUMENTOS):
        return {nome: documentos[nome] for nome in CAMPOS_DOCUMENTOS}
    return {
        nome: {campo: documentos.get(campo, "") for campo in campos}
        for nome, campos in CAMPOS_DOCUMENTOS.items()
    }


def _ids_documentos_adicionais(texto: str) -> set[int]:
    return {int(match) for match in DOCUMENTO_NUMERO_RE.findall(texto) if int(match) >= 12}


def _artigos_lei_14133_fora_do_catalogo(documentos: dict) -> list[dict]:
    ocorrencias = []
    for nome, campos in documentos.items():
        if not isinstance(campos, dict):
            continue
        for campo, valor in campos.items():
            texto = _texto(valor)
            for trecho in re.split(r"(?<=[!?;])\s+|(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])", texto):
                if not re.search(r"(?i)\blei\s*(?:federal\s*)?(?:n[ºo.]?\s*)?14\s*[.,]\s*133(?:\s*/\s*2021)?\b", trecho):
                    continue
                for match in CITACAO_ARTIGO_RE.finditer(trecho):
                    artigo = int(match.group(1))
                    if artigo not in ARTIGOS_LEI_14133:
                        ocorrencias.append({
                            "documento": nome,
                            "campo": campo,
                            "artigo": artigo,
                            "trecho": trecho[:500],
                        })
    return ocorrencias


def avaliar_conformidade(documentos: dict, dados_usuario: dict | None = None) -> dict:
    dados = dados_usuario if isinstance(dados_usuario, dict) else {}
    docs = _documentos_normalizados(documentos if isinstance(documentos, dict) else {})
    verificacoes: list[dict] = []
    alertas: list[dict] = []

    for nome, campos in CAMPOS_DOCUMENTOS.items():
        ausentes = [campo for campo in campos if not _texto(docs[nome].get(campo))]
        verificacoes.append({
            "id": f"campos_{nome.lower()}",
            "titulo": f"Campos obrigatórios — {nome}",
            "status": "alerta" if ausentes else "ok",
            "detalhe": "Campos sem conteúdo: " + ", ".join(ausentes) if ausentes else "Todos os campos obrigatórios estão preenchidos.",
        })
        if ausentes:
            alertas.append({"tipo": "campo_vazio", "documento": nome, "campos": ausentes})

    marcadores: list[dict] = []
    citacoes: list[str] = []
    for nome, campos in docs.items():
        for campo, valor in campos.items():
            texto = _texto(valor)
            for match in PLACEHOLDER_RE.finditer(texto):
                marcadores.append({"documento": nome, "campo": campo, "marcador": match.group(0)})
            if CITACAO_RE.search(texto):
                citacoes.append(nome)
    verificacoes.append({
        "id": "marcadores_pendentes",
        "titulo": "Marcadores de preenchimento",
        "status": "alerta" if marcadores else "ok",
        "detalhe": f"Foram encontrados {len(marcadores)} marcador(es) que precisam de conferência." if marcadores else "Nenhum marcador de preenchimento detectado.",
    })
    if marcadores:
        alertas.append({"tipo": "marcador_pendente", "ocorrencias": marcadores})

    if citacoes:
        verificacoes.append({
            "id": "fundamentos_legais",
            "titulo": "Fundamentos e citações legais",
            "status": "revisao",
            "detalhe": "Há referências normativas ou jurisprudenciais. A ferramenta não verifica automaticamente a vigência, o texto ou a fonte primária; confira cada citação.",
        })
        alertas.append({"tipo": "revisao_fundamento_legal", "documentos": sorted(set(citacoes))})
    else:
        verificacoes.append({
            "id": "fundamentos_legais",
            "titulo": "Fundamentos e citações legais",
            "status": "revisao",
            "detalhe": "Não foram detectadas referências normativas identificáveis. Confirme se a fundamentação jurídica exigida está adequada ao objeto.",
        })

    artigos_citados = _artigos_lei_14133(docs)
    artigos_fora_catalogo = [item for item in artigos_citados if item["artigo"] not in ARTIGOS_LEI_14133]
    artigos_incoerentes = [item for item in artigos_citados if item["coerencia"] == "incompativel"]
    verificacoes.append({
        "id": "catalogo_artigos_lei_14133",
        "titulo": "Tema e coerência das citações da Lei 14.133/2021",
        "status": "alerta" if artigos_fora_catalogo or artigos_incoerentes else "revisao",
        "detalhe": (
            f"Foram encontradas {len(artigos_fora_catalogo)} citação(ões) fora do catálogo numérico (arts. 1º a 194)."
            if artigos_fora_catalogo
            else f"Foram encontrados {len(artigos_incoerentes)} possível(is) conflito(s) entre o tema do artigo e o contexto citado."
            if artigos_incoerentes
            else "As citações numéricas foram associadas ao tema catalogado. A comparação temática só sinaliza incompatibilidades claras e não valida a interpretação ou a aplicabilidade do dispositivo."
        ),
    })
    if artigos_fora_catalogo:
        alertas.append({"tipo": "artigo_fora_catalogo_lei_14133", "ocorrencias": artigos_fora_catalogo})
    if artigos_incoerentes:
        alertas.append({"tipo": "citacao_incoerente_lei_14133", "ocorrencias": artigos_incoerentes})

    referencias_normativas = _referencias_normativas_complementares(docs)
    verificacoes.append({
        "id": "referencias_normativas_complementares",
        "titulo": "Decretos e súmulas identificados",
        "status": "revisao" if referencias_normativas else "ok",
        "detalhe": (
            f"Foram identificadas {len(referencias_normativas)} referência(s) a decreto(s) ou súmula(s). Confira órgão, número, texto, vigência e pertinência."
            if referencias_normativas
            else "Nenhuma citação de decreto ou súmula foi detectada nos campos analisados."
        ),
    })
    if referencias_normativas:
        alertas.append({"tipo": "referencias_normativas_complementares", "ocorrencias": referencias_normativas})

    requisitos_etp = _texto(docs["ETP"].get("REQUISITOS_ETP"))
    requisitos_tr = _texto(docs["TR"].get("REQUISITOS_TR"))
    adicionais_etp = _ids_documentos_adicionais(requisitos_etp)
    adicionais_tr = _ids_documentos_adicionais(requisitos_tr)
    coerentes = adicionais_etp == adicionais_tr or (
        not adicionais_etp and "não há documentos adicionais" in requisitos_tr.casefold()
    )
    verificacoes.append({
        "id": "requisitos_habilitacao",
        "titulo": "Coerência dos documentos adicionais de habilitação",
        "status": "ok" if coerentes else "alerta",
        "detalhe": "A numeração dos documentos adicionais no ETP e no TR coincide." if coerentes else f"ETP: {sorted(adicionais_etp)}; TR: {sorted(adicionais_tr)}. Confira se o TR reproduz os requisitos do ETP sem criar ou retirar exigências.",
    })
    if not coerentes:
        alertas.append({"tipo": "requisitos_habilitacao_divergentes", "etp": sorted(adicionais_etp), "tr": sorted(adicionais_tr)})

    amostra_informada = _texto(dados.get("{{AMOST}}")).casefold()
    texto_amostra = _texto(docs["TR"].get("AMOSTRA_TR"))
    exige_amostra = amostra_informada in {"sim", "true", "1"}
    menciona_amostra = bool(re.search(r"(?i)amostra|prot[oó]tipo", texto_amostra))
    dispensa_amostra = bool(re.search(r"(?i)dispensad|n[aã]o\s+(?:ser[aá]\s+)?exigid|n[aã]o\s+necess[aá]ri|inexig", texto_amostra))
    exige_no_texto = bool(re.search(r"(?i)obrigat|exigid|dever[aá]\s+apresent|apresentar\s+(?:a\s+)?amostra", texto_amostra)) and not dispensa_amostra
    amostra_contem = (menciona_amostra and not dispensa_amostra) if exige_amostra else exige_no_texto
    amostra_status = "ok" if (exige_amostra == amostra_contem) else "alerta"
    verificacoes.append({
        "id": "amostra",
        "titulo": "Amostra conforme opção informada",
        "status": amostra_status,
        "detalhe": "A seção de amostra parece compatível com a opção informada." if amostra_status == "ok" else "Confira se a previsão de amostra no TR corresponde à opção selecionada no formulário.",
    })
    if amostra_status != "ok":
        alertas.append({"tipo": "amostra_incoerente", "informada": exige_amostra, "texto_detectado": amostra_contem})

    pagamento_tipo = _texto(dados.get("PAGAMENTO_TIPO")).upper()
    if pagamento_tipo == "POR_ETAPAS":
        fonte = _texto(dados.get("PAGAMENTO_ETAPAS_RAW"))
        pagamento_tr = _texto(dados.get("PAGAMENTO"))
        tokens = set(NUMERO_RE.findall(fonte))
        divergentes = sorted(token for token in tokens if token not in pagamento_tr)
        verificacoes.append({
            "id": "pagamento_etapas",
            "titulo": "Preservação dos marcos do pagamento por etapas",
            "status": "alerta" if divergentes else "ok",
            "detalhe": "Confira os números, percentuais, datas e marcos do pagamento por etapas." if divergentes else "Os números identificados na instrução de pagamento foram encontrados no texto revisado.",
        })
        if divergentes:
            alertas.append({"tipo": "pagamento_etapas_tokens", "tokens_nao_encontrados": divergentes})

    matriz = _avaliar_matriz_legal(docs, dados)
    total = len(verificacoes)
    ok = sum(item["status"] == "ok" for item in verificacoes)
    revisao = sum(item["status"] == "revisao" for item in verificacoes)
    pendencias = sum(item["status"] == "alerta" for item in verificacoes)
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "pendencias" if pendencias or matriz["summary"]["alertas"] else "revisao_humana",
        "summary": {"total": total, "ok": ok, "pendencias": pendencias, "revisao": revisao, "matriz_alertas": matriz["summary"]["alertas"], "matriz_revisao": matriz["summary"]["revisao"]},
        "verificacoes": verificacoes,
        "matriz_conformidade": matriz,
        "alertas": alertas,
        "limites": [
            "A análise é automatizada e baseada em verificações estruturais e de coerência; não substitui análise jurídica, técnica ou administrativa.",
            "Não confirma vigência de normas, validade de jurisprudência, adequação do objeto, pesquisa de mercado ou autenticidade de fontes.",
            "O resultado é um checklist de revisão e não certifica conformidade legal dos documentos.",
        ],
    }


def formatar_relatorio_conformidade(relatorio: dict) -> str:
    resumo = relatorio.get("summary", {})
    linhas = [
        "LICITA.AI — CHECKLIST AUTOMATIZADO DE REVISÃO DOCUMENTAL",
        f"Gerado em: {relatorio.get('generated_at', '')}",
        "",
        f"Verificações: {resumo.get('ok', 0)} OK | {resumo.get('pendencias', 0)} pendência(s) | {resumo.get('revisao', 0)} item(ns) para revisão humana",
        "",
    ]
    for item in relatorio.get("verificacoes", []):
        linhas.append(f"[{str(item.get('status', '')).upper()}] {item.get('titulo', '')}")
        linhas.append(str(item.get("detalhe", "")))
        linhas.append("")
    if relatorio.get("alertas"):
        linhas.extend(["ALERTAS DETALHADOS", ""])
        for alerta in relatorio["alertas"]:
            linhas.append(json.dumps(alerta, ensure_ascii=False))
    linhas.extend(["", "LIMITES DA VERIFICAÇÃO"])
    linhas.extend(f"- {limite}" for limite in relatorio.get("limites", []))
    return "\n".join(linhas)



FONTE_LEI_14133 = "https://normas.leg.br/?urn=urn:lex:br:federal:lei:2021-04-01;14133"
MATRIZ_ETP = [
    ("etp_i", "Art. 18, § 1º, I", "Descrição da necessidade", ["DFD.JUSTIFICATIVA"], True, "Obrigatório no mínimo legal"),
    ("etp_ii", "Art. 18, § 1º, II", "Alinhamento ao PAC, quando elaborado", ["ETP.JUSTIFICATIVA_PAC"], False, "Quando houver PAC; ausência deve ser justificada"),
    ("etp_iii", "Art. 18, § 1º, III", "Requisitos da contratação", ["ETP.REQUISITOS_ETP"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_iv", "Art. 18, § 1º, IV", "Estimativa das quantidades e memória de cálculo", ["DFD.ESTIMATIVA_QUANTIDADES", "ETP.JUSTIFICATIVA_ESTIMATIVA"], True, "Obrigatório no mínimo legal"),
    ("etp_v", "Art. 18, § 1º, V", "Levantamento de mercado e escolha da solução", ["ETP.MERCADO"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_vi", "Art. 18, § 1º, VI", "Estimativa do valor e suporte da pesquisa", ["dados:{{VALOR_ESTIMADO}}", "ETP.JUSTIFICATIVA_ESTIMATIVA"], True, "Obrigatório no mínimo legal"),
    ("etp_vii", "Art. 18, § 1º, VII", "Descrição da solução como um todo", ["ETP.SOLUCAO"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_viii", "Art. 18, § 1º, VIII", "Justificativa do parcelamento ou não", ["ETP.PARCELAMENTO"], True, "Obrigatório no mínimo legal"),
    ("etp_ix", "Art. 18, § 1º, IX", "Resultados pretendidos", ["DFD.RESULTADOS_ESPERADOS"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_x", "Art. 18, § 1º, X", "Providências prévias da Administração", ["ETP.PROVIDENCIAS_CONT"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_xi", "Art. 18, § 1º, XI", "Contratações correlatas ou interdependentes", ["ETP.CORRELATAS_INTER"], False, "Omissão dos elementos do § 1º deve ser justificada"),
    ("etp_xii", "Art. 18, § 1º, XII", "Impactos ambientais e mitigação, quando aplicável", ["ETP.CRITERIOS_SUSTENTABILIDADE"], False, "Aplicabilidade deve ser analisada e eventual omissão justificada"),
    ("etp_xiii", "Art. 18, § 1º, XIII", "Conclusão sobre adequação da contratação", ["ETP.CONCLUSAO"], True, "Obrigatório no mínimo legal"),
]
MATRIZ_TR = [
    ("tr_a", "Art. 6º, XXIII, a", "Objeto, natureza, quantitativos e prazo", ["DFD.OBJETO", "DFD.TIPO_OBJ", "DFD.ESTIMATIVA_QUANTIDADES", "dados:{{VIGENCIA}}"], True),
    ("tr_b", "Art. 6º, XXIII, b", "Fundamentação e referência ao ETP", ["DFD.JUSTIFICATIVA", "ETP.CONCLUSAO"], True),
    ("tr_c", "Art. 6º, XXIII, c", "Descrição da solução como um todo", ["ETP.SOLUCAO"], True),
    ("tr_d", "Art. 6º, XXIII, d", "Requisitos da contratação", ["TR.REQUISITOS_TR"], True),
    ("tr_e", "Art. 6º, XXIII, e", "Modelo de execução", ["TR.EXECUCAO"], True),
    ("tr_f", "Art. 6º, XXIII, f", "Modelo de gestão e fiscalização", ["TR.OBRIGACOES_CONTRATADA", "TR.OBRIGACOES_CONTRANTE", "dados:{{GESTOR}}", "dados:{{FISCAL}}"], True),
    ("tr_g", "Art. 6º, XXIII, g", "Critérios de medição e pagamento", ["dados:{{PAGAMENTO}}"], True),
    ("tr_h", "Art. 6º, XXIII, h", "Forma e critérios de seleção do fornecedor", ["TR.QUALIFICACAO_TECNICA", "dados:{{MODALIDADE}}", "dados:{{CRITERIOS}}"], True),
    ("tr_i", "Art. 6º, XXIII, i", "Estimativa do valor e suporte", ["dados:{{VALOR_ESTIMADO}}", "dados:{{ITENS}}"], True),
    ("tr_j", "Art. 6º, XXIII, j", "Adequação orçamentária", ["dados:{{DOTACAO}}"], True),
]


def _valor_matriz(campo: str, documentos: dict, dados_usuario: dict) -> str:
    if campo.startswith("dados:"):
        valor = _texto(dados_usuario.get(campo.removeprefix("dados:")))
    elif "." in campo:
        documento, chave = campo.split(".", 1)
        valor = _texto(documentos.get(documento, {}).get(chave))
    else:
        valor = ""
    if valor.casefold() in {"não informado", "nao informado", "[não informado]", "[nao informado]", "não informada", "nao informada"}:
        return ""
    if PLACEHOLDER_RE.search(valor):
        return ""
    return valor


def _avaliar_matriz_legal(documentos: dict, dados_usuario: dict) -> dict:
    itens = []
    for especificacao in MATRIZ_ETP:
        identificador, base, titulo, campos, minimo, nota = especificacao
        ausentes = [campo for campo in campos if not _valor_matriz(campo, documentos, dados_usuario)]
        status = "alerta" if ausentes and minimo else "revisao"
        if not ausentes:
            detalhe = "Texto/campo localizado; a qualidade e adequação do conteúdo exigem revisão humana."
        elif minimo:
            detalhe = "Elemento mínimo do ETP não localizado: " + ", ".join(ausentes)
        else:
            detalhe = "Confira se o elemento está presente ou se sua omissão foi justificada: " + ", ".join(ausentes)
        itens.append({"id": identificador, "base": base, "titulo": titulo, "status": status, "campos": campos, "detalhe": detalhe, "nota": nota})
    for identificador, base, titulo, campos, obrigatorio in MATRIZ_TR:
        ausentes = [campo for campo in campos if not _valor_matriz(campo, documentos, dados_usuario)]
        status = "alerta" if ausentes and obrigatorio else "revisao"
        detalhe = "Campos localizados; revise o conteúdo e sua adequação." if not ausentes else "Confira os elementos do TR: " + ", ".join(ausentes)
        itens.append({"id": identificador, "base": base, "titulo": titulo, "status": status, "campos": campos, "detalhe": detalhe})
    itens.extend([
        {
            "id": "risco_art18_x",
            "base": "Art. 18, X",
            "titulo": "Análise de riscos do processo",
            "status": "revisao",
            "campos": [],
            "detalhe": "A ferramenta não gera uma análise de riscos autônoma. Verifique se foi elaborada e juntada ao processo.",
        },
        {
            "id": "matriz_risco_art22",
            "base": "Art. 22, § 3º",
            "titulo": "Matriz de alocação de riscos, quando legalmente aplicável",
            "status": "revisao",
            "campos": [],
            "detalhe": "Verifique a aplicabilidade às hipóteses legais, como obras/serviços de grande vulto e regimes integrado ou semi-integrado; não é exigida automaticamente para toda contratação.",
        },
        {
            "id": "modo_disputa_art18_viii",
            "base": "Art. 18, VIII",
            "titulo": "Modo de disputa",
            "status": "revisao",
            "campos": [],
            "detalhe": "O formulário não captura o modo de disputa. Confira a definição e a motivação no edital.",
        },
        {
            "id": "pesquisa_precos_art23",
            "base": "Art. 23",
            "titulo": "Compatibilidade da estimativa com mercado e fontes de preços",
            "status": "revisao",
            "campos": ["dados:{{ITENS}}", "dados:{{VALOR_ESTIMADO}}"],
            "detalhe": "O relatório não valida pesquisa de preços nem a autenticidade das fontes. Confira as fontes, metodologia, datas, memória de cálculo e parâmetros de estimativa no processo.",
        },
    ])
    resumo = {
        "total": len(itens),
        "alertas": sum(item["status"] == "alerta" for item in itens),
        "revisao": sum(item["status"] == "revisao" for item in itens),
    }
    return {"fonte": FONTE_LEI_14133, "summary": resumo, "itens": itens, "limite": "A matriz confere presença de campos e registra itens para revisão; não valida conteúdo jurídico, técnico, mercado, vigência ou aplicabilidade."}


def _montar_catalogo_artigos_lei_14133() -> dict[int, dict[str, str | None]]:
    faixas = [
        (1, 4, "Âmbito de aplicação, objetos abrangidos, exclusões e tratamento das ME/EPP", None),
        (5, 5, "Princípios aplicáveis às licitações e aos contratos", None),
        (6, 6, "Definições legais", None),
        (7, 10, "Agentes públicos, agente de contratação, impedimentos e defesa dos agentes", None),
        (11, 17, "Objetivos, diretrizes e organização do processo licitatório", "processo"),
        (18, 27, "Fase preparatória, planejamento, estudos, orçamento e regras do edital", "planejamento"),
        (28, 32, "Modalidades de licitação", "modalidades"),
        (33, 39, "Critérios de julgamento", "julgamento"),
        (40, 52, "Disposições setoriais sobre compras, obras, serviços, locação e licitações internacionais", None),
        (53, 54, "Controle de legalidade e publicidade do edital", "publicidade_edital"),
        (55, 58, "Apresentação de propostas, lances e garantia de proposta", "propostas"),
        (59, 61, "Julgamento das propostas, desempate e negociação", "julgamento"),
        (62, 70, "Habilitação jurídica, técnica, fiscal, social, trabalhista e econômico-financeira", "habilitacao"),
        (71, 71, "Encerramento da licitação", "processo"),
        (72, 75, "Processo de contratação direta, inexigibilidade e dispensa", "contratacao_direta"),
        (76, 77, "Alienação de bens públicos", "alienacoes"),
        (78, 88, "Procedimentos e instrumentos auxiliares das contratações", "instrumentos_auxiliares"),
        (89, 102, "Formalização dos contratos e garantias contratuais", "contratos"),
        (103, 103, "Alocação de riscos contratuais", "contratos"),
        (104, 104, "Prerrogativas da Administração nos contratos", "contratos"),
        (105, 114, "Duração e prorrogação dos contratos", "contratos"),
        (115, 123, "Execução, fiscalização, gestão e responsabilidades contratuais", "execucao_contratual"),
        (124, 136, "Alterações contratuais, reajuste e recomposição de preços", "alteracao_contratual"),
        (137, 139, "Hipóteses e consequências da extinção contratual", "extincao_contratual"),
        (140, 140, "Recebimento do objeto do contrato", "execucao_contratual"),
        (141, 146, "Ordem cronológica e procedimentos de pagamento", "pagamentos"),
        (147, 150, "Nulidade dos contratos e seus efeitos", "contratos"),
        (151, 154, "Meios alternativos de resolução de controvérsias", "contratos"),
        (155, 163, "Infrações e sanções administrativas", "sancoes"),
        (164, 168, "Impugnações, pedidos de esclarecimento e recursos", "recursos"),
        (169, 173, "Gestão de riscos e controle das contratações", "controle"),
        (174, 176, "Portal Nacional de Contratações Públicas (PNCP)", "pncp"),
        (177, 180, "Alterações legislativas relacionadas à Lei", None),
        (181, 194, "Disposições transitórias e finais", None),
    ]
    catalogo = {
        artigo: {"tema": tema, "dominio": dominio}
        for inicio, fim, tema, dominio in faixas
        for artigo in range(inicio, fim + 1)
    }
    catalogo.update({
        18: {"tema": "Fase preparatória e elementos do planejamento da contratação, incluindo ETP e análise de riscos", "dominio": "planejamento"},
        20: {"tema": "Enquadramento de bens de consumo nas categorias comum e de luxo", "dominio": "planejamento"},
        22: {"tema": "Matriz de alocação de riscos na fase preparatória", "dominio": "planejamento"},
        23: {"tema": "Estimativa do valor da contratação", "dominio": "planejamento"},
        24: {"tema": "Caráter sigiloso do orçamento estimado", "dominio": "planejamento"},
        25: {"tema": "Regras e cláusulas do edital", "dominio": "publicidade_edital"},
        28: {"tema": "Modalidades de licitação", "dominio": "modalidades"},
        29: {"tema": "Pregão e concorrência", "dominio": "modalidades"},
        30: {"tema": "Concurso", "dominio": "modalidades"},
        31: {"tema": "Leilão", "dominio": "modalidades"},
        32: {"tema": "Diálogo competitivo", "dominio": "modalidades"},
        33: {"tema": "Critérios de julgamento", "dominio": "julgamento"},
        40: {"tema": "Planejamento das compras", "dominio": "planejamento"},
        41: {"tema": "Indicação de marcas e modelos e exigências relacionadas à aquisição", "dominio": None},
        42: {"tema": "Comprovação da qualidade de produto", "dominio": None},
        44: {"tema": "Consideração do ciclo de vida do objeto", "dominio": None},
        53: {"tema": "Controle prévio de legalidade da contratação", "dominio": "publicidade_edital"},
        54: {"tema": "Divulgação e publicação do edital", "dominio": "publicidade_edital"},
        55: {"tema": "Prazos mínimos para apresentação de propostas e lances", "dominio": "propostas"},
        56: {"tema": "Modos de disputa", "dominio": "propostas"},
        57: {"tema": "Intervalos mínimos entre lances", "dominio": "propostas"},
        58: {"tema": "Garantia de proposta", "dominio": "propostas"},
        59: {"tema": "Desclassificação de propostas", "dominio": "julgamento"},
        60: {"tema": "Critérios de desempate", "dominio": "julgamento"},
        61: {"tema": "Negociação de condições mais vantajosas", "dominio": "julgamento"},
        62: {"tema": "Categorias da habilitação", "dominio": "habilitacao"},
        66: {"tema": "Qualificação técnico-profissional e técnico-operacional", "dominio": "habilitacao"},
        68: {"tema": "Habilitação fiscal, social e trabalhista", "dominio": "habilitacao"},
        69: {"tema": "Habilitação econômico-financeira", "dominio": "habilitacao"},
        72: {"tema": "Instrução do processo de contratação direta", "dominio": "contratacao_direta"},
        74: {"tema": "Inexigibilidade de licitação", "dominio": "contratacao_direta"},
        75: {"tema": "Hipóteses de dispensa de licitação", "dominio": "contratacao_direta"},
        76: {"tema": "Alienação de bens da Administração Pública", "dominio": "alienacoes"},
        79: {"tema": "Procedimento auxiliar de credenciamento", "dominio": "instrumentos_auxiliares"},
        80: {"tema": "Pré-qualificação", "dominio": "instrumentos_auxiliares"},
        81: {"tema": "Procedimento de manifestação de interesse", "dominio": "instrumentos_auxiliares"},
        82: {"tema": "Sistema de registro de preços e conteúdo do edital", "dominio": "instrumentos_auxiliares"},
        86: {"tema": "Intenção de registro de preços", "dominio": "instrumentos_auxiliares"},
        87: {"tema": "Registro cadastral", "dominio": "instrumentos_auxiliares"},
        89: {"tema": "Regime jurídico e formalização dos contratos", "dominio": "contratos"},
        92: {"tema": "Cláusulas necessárias dos contratos", "dominio": "contratos"},
        94: {"tema": "Divulgação do contrato no PNCP como condição de eficácia", "dominio": "pncp"},
        96: {"tema": "Exigência e modalidades de garantia contratual", "dominio": "contratos"},
        103: {"tema": "Matriz de alocação de riscos", "dominio": "contratos"},
        104: {"tema": "Prerrogativas da Administração", "dominio": "contratos"},
        105: {"tema": "Duração dos contratos", "dominio": "contratos"},
        115: {"tema": "Execução fiel do contrato", "dominio": "execucao_contratual"},
        117: {"tema": "Acompanhamento e fiscalização da execução contratual", "dominio": "execucao_contratual"},
        118: {"tema": "Subcontratação", "dominio": "execucao_contratual"},
        121: {"tema": "Encargos trabalhistas, previdenciários, fiscais e comerciais", "dominio": "execucao_contratual"},
        124: {"tema": "Alterações unilaterais e consensuais dos contratos", "dominio": "alteracao_contratual"},
        125: {"tema": "Limites e condições para alterações contratuais", "dominio": "alteracao_contratual"},
        126: {"tema": "Reequilíbrio econômico-financeiro em alterações contratuais", "dominio": "alteracao_contratual"},
        137: {"tema": "Motivos para extinção dos contratos", "dominio": "extincao_contratual"},
        138: {"tema": "Extinção unilateral e consensual", "dominio": "extincao_contratual"},
        140: {"tema": "Recebimento provisório e definitivo do objeto", "dominio": "execucao_contratual"},
        141: {"tema": "Ordem cronológica de pagamentos", "dominio": "pagamentos"},
        147: {"tema": "Avaliação de consequências da nulidade contratual", "dominio": "contratos"},
        151: {"tema": "Meios alternativos de prevenção e resolução de controvérsias", "dominio": "contratos"},
        155: {"tema": "Infrações administrativas de licitantes e contratados", "dominio": "sancoes"},
        156: {"tema": "Sanções administrativas", "dominio": "sancoes"},
        157: {"tema": "Dosimetria e aplicação das sanções", "dominio": "sancoes"},
        164: {"tema": "Impugnação do edital e pedido de esclarecimento", "dominio": "recursos"},
        165: {"tema": "Recursos administrativos", "dominio": "recursos"},
        169: {"tema": "Linhas de defesa e gestão de riscos nas contratações", "dominio": "controle"},
        174: {"tema": "Portal Nacional de Contratações Públicas", "dominio": "pncp"},
    })
    return catalogo


ARTIGOS_LEI_14133_TEMAS = _montar_catalogo_artigos_lei_14133()
ARTIGOS_LEI_14133 = set(ARTIGOS_LEI_14133_TEMAS)
CITACAO_ARTIGO_RE = re.compile(r"(?i)\b(?:art\.?|artigo)\s*(\d{1,3})\b")
CITACAO_DECRETO_RE = re.compile(r"(?i)\b(?P<tipo>decreto(?:-lei)?)\s*(?:federal|estadual|municipal\s*)?(?:n[ºo.]?\s*)?(?P<numero>\d{1,3}(?:\.\d{3})*(?:[./-]\d{2,4})?)\b")
CITACAO_SUMULA_RE = re.compile(r"(?i)\bS[uú]mula\s+(?:(?P<tribunal>TCU|STF|STJ|TST|TSE|TCE(?:[-/ ]?[A-Z]{2})?)\s*(?:n[ºo.]?\s*)?(?P<num_a>\d{1,4})|(?:n[ºo.]?\s*)?(?P<num_b>\d{1,4})(?:\s+(?:do|da)\s+(?P<tribunal_pos>TCU|STF|STJ|TST|TSE|TCE(?:[-/ ]?[A-Z]{2})?))?)\b")


DOMINIOS_CONTEXTO_LEGAL = {
    "planejamento": re.compile(r"(?i)\b(planejamento|fase\s+preparat[oó]ria|estudo\s+t[eé]cnico\s+preliminar|ETP|termo\s+de\s+refer[eê]ncia|or[cç]amento\s+estimado|estimativa\s+de\s+pre[cç]os)\b"),
    "contratacao_direta": re.compile(r"(?i)\b(contrata[cç][aã]o\s+direta|dispensa|inexigibilidade|emerg[eê]ncia|emergencial|exclusividade)\b"),
    "modalidades": re.compile(r"(?i)\b(preg[aã]o|concorr[eê]ncia|leil[aã]o|concurso|di[aá]logo\s+competitivo|modalidade)\b"),
    "julgamento": re.compile(r"(?i)\b(julgamento|desclassifica[cç][aã]o|desempate|crit[eé]rio\s+de\s+julgamento|negocia[cç][aã]o)\b"),
    "publicidade_edital": re.compile(r"(?i)\b(edital|publica[cç][aã]o|publicidade|PNCP|aviso\s+de\s+licita[cç][aã]o)\b"),
    "propostas": re.compile(r"(?i)\b(propostas?|lances|modo\s+de\s+disputa|garantia\s+de\s+proposta)\b"),
    "habilitacao": re.compile(r"(?i)\b(habilita[cç][aã]o|qualifica[cç][aã]o|atestado|capacidade\s+t[eé]cnica|regularidade\s+fiscal|documenta[cç][aã]o\s+do\s+licitante)\b"),
    "instrumentos_auxiliares": re.compile(r"(?i)\b(credenciamento|pr[eé]-qualifica[cç][aã]o|sistema\s+de\s+registro\s+de\s+pre[cç]os|registro\s+cadastral)\b"),
    "execucao_contratual": re.compile(r"(?i)\b(execuc[aã]o\s+contratual|fiscaliza[cç][aã]o|fiscal\s+do\s+contrato|gestor\s+do\s+contrato|recebimento|medi[cç][aã]o|ordem\s+de\s+servi[cç]o|encargos\s+trabalhistas)\b"),
    "alteracao_contratual": re.compile(r"(?i)\b(aditivo|altera[cç][aã]o\s+contratual|reequil[ií]brio|reajuste|repactua[cç][aã]o|revis[aã]o\s+de\s+pre[cç]os)\b"),
    "extincao_contratual": re.compile(r"(?i)\b(extin[cç][aã]o|rescis[aã]o|anula[cç][aã]o\s+do\s+contrato)\b"),
    "pagamentos": re.compile(r"(?i)\b(pagamento|ordem\s+cronol[oó]gica|liquida[cç][aã]o|antecipa[cç][aã]o)\b"),
    "alienacoes": re.compile(r"(?i)\b(aliena[cç][aã]o|leil[aã]o\s+de\s+bens|venda\s+de\s+bens?)\b"),
    "sancoes": re.compile(r"(?i)\b(san[cç][aã]o|multa|impedimento|inidoneidade|penalidade|infra[cç][aã]o\s+administrativa)\b"),
    "recursos": re.compile(r"(?i)\b(recurso|impugna[cç][aã]o|pedido\s+de\s+esclarecimento|contrarraz[oõ]es)\b"),
    "controle": re.compile(r"(?i)\b(controle\s+das\s+contrata[cç][oõ]es|gest[aã]o\s+de\s+riscos|linhas\s+de\s+defesa)\b"),
    "pncp": re.compile(r"(?i)\b(portal\s+nacional\s+de\s+contrata[cç][oõ]es\s+p[uú]blicas|PNCP)\b"),
}


def _dominios_do_trecho(trecho: str) -> set[str]:
    return {dominio for dominio, padrao in DOMINIOS_CONTEXTO_LEGAL.items() if padrao.search(trecho)}


def _artigos_lei_14133(documentos: dict) -> list[dict]:
    ocorrencias = []
    for nome, campos in documentos.items():
        if not isinstance(campos, dict):
            continue
        for campo, valor in campos.items():
            texto = _texto(valor)
            trechos = re.split(r"(?<=[!?;])\s+|(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])", texto)
            for trecho in trechos:
                if not re.search(r"(?i)\blei\s*(?:federal\s*)?(?:n[ºo.]?\s*)?14\s*[.,]\s*133(?:\s*/\s*2021)?\b", trecho):
                    continue
                for match in CITACAO_ARTIGO_RE.finditer(trecho):
                    artigo = int(match.group(1))
                    tema = ARTIGOS_LEI_14133_TEMAS.get(artigo)
                    dominios = _dominios_do_trecho(trecho)
                    dominio_artigo = tema.get("dominio") if tema else None
                    incompativel = bool(dominio_artigo and len(dominios) == 1 and dominio_artigo not in dominios)
                    ocorrencias.append({
                        "documento": nome,
                        "campo": campo,
                        "artigo": artigo,
                        "tema": tema["tema"] if tema else "Fora do catálogo da Lei 14.133/2021",
                        "dominio_artigo": dominio_artigo,
                        "dominios_contexto": sorted(dominios),
                        "coerencia": "incompativel" if incompativel else "sem_conflito_identificado",
                        "trecho": trecho[:500],
                    })
    return ocorrencias


def _referencias_normativas_complementares(documentos: dict) -> list[dict]:
    ocorrencias = []
    vistos = set()
    for nome, campos in documentos.items():
        if not isinstance(campos, dict):
            continue
        for campo, valor in campos.items():
            texto = _texto(valor)
            for trecho in re.split(r"(?<=[!?;])\s+|(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])", texto):
                for match in CITACAO_DECRETO_RE.finditer(trecho):
                    referencia = f"{match.group('tipo').title()} nº {match.group('numero')}"
                    chave = (nome, campo, referencia, trecho)
                    if chave not in vistos:
                        vistos.add(chave)
                        ocorrencias.append({"tipo": "decreto", "referencia": referencia, "documento": nome, "campo": campo, "trecho": trecho[:500]})
                for match in CITACAO_SUMULA_RE.finditer(trecho):
                    tribunal = match.group("tribunal") or match.group("tribunal_pos")
                    numero = match.group("num_a") or match.group("num_b")
                    referencia = f"Súmula {tribunal} nº {numero}" if tribunal else f"Súmula nº {numero}"
                    chave = (nome, campo, referencia, trecho)
                    if chave not in vistos:
                        vistos.add(chave)
                        ocorrencias.append({"tipo": "sumula", "referencia": referencia, "documento": nome, "campo": campo, "trecho": trecho[:500]})
    return ocorrencias


def formatar_relatorio_referencias(resultado: dict) -> str:
    dados = resultado if isinstance(resultado, dict) else {}
    linhas = [
        "LICITA.AI — RELATÓRIO DE REFERÊNCIAS E CAMPOS ESTRUTURAIS",
        "",
        "Campos estruturais verificados",
    ]
    pendentes: list[str] = []
    for nome, campos in CAMPOS_DOCUMENTOS.items():
        bloco = dados.get(nome, {}) if isinstance(dados.get(nome), dict) else {}
        preenchidos = sum(bool(_texto(bloco.get(campo))) for campo in campos)
        linhas.append(f"- {nome}: {preenchidos}/{len(campos)} campo(s) com conteúdo")
        pendentes.extend(f"{nome}.{campo}" for campo in campos if not _texto(bloco.get(campo)))
    linhas.append("")
    linhas.append("Campos pendentes")
    if pendentes:
        linhas.extend(f"- {campo}" for campo in pendentes)
    else:
        linhas.append("- Nenhum campo estrutural vazio detectado.")
    linhas.extend(["", "Fontes consultadas"])
    fontes: list[dict] = []
    def coletar(valor):
        if isinstance(valor, dict):
            for chave, item in valor.items():
                if str(chave).upper() in {"FONTES_OFICIAIS", "FONTES", "SOURCES"} and isinstance(item, list):
                    fontes.extend(fonte for fonte in item if isinstance(fonte, dict))
                else:
                    coletar(item)
        elif isinstance(valor, list):
            for item in valor:
                coletar(item)
    coletar(dados)
    fontes_unicas = {}
    for fonte in fontes:
        url = _texto(fonte.get("url"))
        if url:
            fontes_unicas[url] = fonte
    if fontes_unicas:
        for fonte in fontes_unicas.values():
            linhas.append(f"- {_texto(fonte.get('orgao'))}: {_texto(fonte.get('titulo'))} — {_texto(fonte.get('url'))}")
            relevancia = _texto(fonte.get("relevancia"))
            if relevancia:
                linhas.append(f"  Relevância registrada: {relevancia}")
    else:
        linhas.append("- Nenhuma fonte com URL foi encontrada no resultado estruturado.")
    artigos: set[int] = set()
    for bloco in dados.values():
        textos = []
        if isinstance(bloco, dict):
            textos.extend(_texto(valor) for valor in bloco.values() if isinstance(valor, str))
        elif isinstance(bloco, str):
            textos.append(bloco)
        for texto in textos:
            artigos.update(int(match) for match in CITACAO_ARTIGO_RE.findall(texto))
    linhas.extend(["", "Referências legais identificadas"])
    if artigos:
        for artigo in sorted(artigos):
            tema = ARTIGOS_LEI_14133_TEMAS.get(artigo)
            if tema:
                linhas.append(f"- artigo {artigo}: No catálogo temático da Lei 14.133/2021 — {tema['tema']}; confirmar a norma citada, o conteúdo e a pertinência.")
            else:
                linhas.append(f"- artigo {artigo}: Referências fora do catálogo — Revisar a fonte e a numeração.")
    else:
        linhas.append("- Nenhuma citação de artigo detectada.")
    referencias_complementares = _referencias_normativas_complementares(dados)
    linhas.extend(["", "Decretos e súmulas identificados"])
    if referencias_complementares:
        for referencia in referencias_complementares:
            linhas.append(f"- {referencia['referencia']} — conferir órgão emissor, texto, vigência e pertinência.")
    else:
        linhas.append("- Nenhuma citação de decreto ou súmula identificada.")
    linhas.extend([
        "",
        "Conferência humana obrigatória",
        "A análise numérica não valida a existência, o texto, a vigência, a interpretação ou a aplicabilidade de qualquer dispositivo. A conferência humana é obrigatória e este relatório não representa parecer jurídico.",
        "A identificação de artigo dentro do catálogo não significa que sua interpretação ou aplicabilidade tenha sido validada.",
        "Não substitui a revisão jurídica, técnica ou administrativa nem confirma autenticidade ou pertinência das fontes.",
    ])
    return "\n".join(linhas)
