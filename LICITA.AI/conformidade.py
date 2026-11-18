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
CITACAO_RE = re.compile(r"(?i)\b(?:art\.?|artigo|lei\s*(?:n[ºo.]?\s*)?|decreto\s*(?:n[ºo.]?\s*)?|s[uú]mula|ac[oó]rd[aã]o|processo)\s*\d")
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
        return _texto(dados_usuario.get(campo.removeprefix("dados:")))
    if "." in campo:
        documento, chave = campo.split(".", 1)
        return _texto(documentos.get(documento, {}).get(chave))
    return ""


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


ARTIGOS_LEI_14133 = set(range(1, 195))
CITACAO_ARTIGO_RE = re.compile(r"(?i)\b(?:art\.?|artigo)\s*(\d{1,3})\b")


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
            if artigo in ARTIGOS_LEI_14133:
                linhas.append(f"- artigo {artigo}: No catálogo numérico da Lei 14.133/2021; confirmar a norma citada, o conteúdo e a pertinência.")
            else:
                linhas.append(f"- artigo {artigo}: Referências fora do catálogo — Revisar a fonte e a numeração.")
    else:
        linhas.append("- Nenhuma citação de artigo detectada.")
    linhas.extend([
        "",
        "Conferência humana obrigatória",
        "A análise numérica não valida a existência, o texto, a vigência, a interpretação ou a aplicabilidade de qualquer dispositivo. A conferência humana é obrigatória e este relatório não representa parecer jurídico.",
        "A identificação de artigo dentro do catálogo não significa que sua interpretação ou aplicabilidade tenha sido validada.",
        "Não substitui a revisão jurídica, técnica ou administrativa nem confirma autenticidade ou pertinência das fontes.",
    ])
    return "\n".join(linhas)
