import re
from datetime import datetime, timedelta

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

def _formatar_nomes_com_sufixo(nomes_str: str, cargos_str: str, sufixo: str) -> str:
    if not nomes_str or nomes_str == "[Não informado]":
        return "[Não informado]" if nomes_str == "[Não informado]" else ""
    nomes = [n.strip() for n in nomes_str.split(",") if n.strip()]
    cargos = [c.strip() for c in cargos_str.split(",") if c.strip()]
    resultado = []
    for i, nome in enumerate(nomes):
        cargo = cargos[i] if i < len(cargos) else ""
        if cargo:
            resultado.append(f"{nome} ({cargo}) - {sufixo}")
        else:
            resultado.append(f"{nome} - {sufixo}")
    return "\n".join(resultado)

def _formatar_hora_min(hora_str: str) -> str:
    if not hora_str:
        return ""
    try:
        t = datetime.strptime(hora_str, "%H:%M")
        return t.strftime("%Hh%Mmin")
    except Exception:
        return hora_str

def _subtrair_15_min(hora_str: str) -> str:
    if not hora_str:
        return ""
    try:
        t = datetime.strptime(hora_str, "%H:%M")
        t_sub = t - timedelta(minutes=15)
        return t_sub.strftime("%Hh%Mmin")
    except Exception:
        return hora_str

def _dia_util_anterior(data_str: str) -> str:
    if not data_str:
        return ""
    try:
        formato = "%d/%m/%Y" if "/" in data_str else "%Y-%m-%d"
        data = datetime.strptime(data_str, formato)
        data -= timedelta(days=1)
        while data.weekday() > 4:
            data -= timedelta(days=1)
        return data.strftime(formato)
    except Exception:
        return data_str

def _limpar_valor_numerico(valor) -> float:
    if isinstance(valor, (int, float)):
        return float(valor)
    try:
        v_str = str(valor).upper().strip()
        v_str = re.sub(r'[^\d.,-]', '', v_str)
        if not v_str:
            return 0.0
        if ',' in v_str and '.' in v_str:
            if v_str.rfind(',') > v_str.rfind('.'):
                v_str = v_str.replace('.', '').replace(',', '.')
            else:
                v_str = v_str.replace(',', '')
        elif ',' in v_str:
            v_str = v_str.replace(',', '.')
        return float(v_str)
    except Exception:
        return 0.0

def _formatar_valor(valor: float) -> str:
    try:
        return f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(valor)

def _valor_por_extenso(valor: float) -> str:
    try:
        unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
        dez1 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
        dezenas = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
        centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]

        def converte_bloco(n):
            if n == 0: return ""
            if n == 100: return "cem"
            c = n // 100
            d = (n % 100) // 10
            u = n % 10
            res = []
            if c > 0: res.append(centenas[c])
            if d == 1:
                res.append(dez1[u])
            else:
                if d > 1: res.append(dezenas[d])
                if u > 0: res.append(unidades[u])
            return " e ".join(res)

        inteiro = int(valor)
        centavos = int(round((valor - inteiro) * 100))
        
        if inteiro == 0 and centavos == 0: 
            return "zero reais"
        
        partes = []
        if inteiro > 0:
            milhoes = inteiro // 1000000
            milhares = (inteiro % 1000000) // 1000
            unids = inteiro % 1000
            
            if milhoes > 0:
                partes.append(converte_bloco(milhoes) + (" milhões" if milhoes > 1 else " milhão"))
            if milhares > 0:
                partes.append(converte_bloco(milhares) + " mil")
            if unids > 0:
                str_unids = converte_bloco(unids)
                if milhoes > 0 or milhares > 0:
                    if unids <= 100 or unids % 100 == 0:
                        partes.append("e " + str_unids)
                    else:
                        partes.append(str_unids)
                else:
                    partes.append(str_unids)
            
            str_inteiro = " ".join(partes)
            if milhoes > 0 and milhares == 0 and unids == 0:
                str_inteiro += " de reais"
            else:
                str_inteiro += " reais" if inteiro > 1 else " real"
        else:
            str_inteiro = ""
            
        str_centavos = ""
        if centavos > 0:
            str_centavos = converte_bloco(centavos) + (" centavos" if centavos > 1 else " centavo")
            
        if str_inteiro and str_centavos:
            return f"{str_inteiro} e {str_centavos}"
        elif str_inteiro:
            return str_inteiro
        else:
            return str_centavos
    except Exception:
        return ""

def _numero_por_extenso(n: int) -> str:
    unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
    dez1 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
    dezenas = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
    centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]
    if n == 0: return "zero"
    if n == 100: return "cem"
    c = n // 100
    d = (n % 100) // 10
    u = n % 10
    res = []
    if c > 0: res.append(centenas[c])
    if d == 1:
        res.append(dez1[u])
    else:
        if d > 1: res.append(dezenas[d])
        if u > 0: res.append(unidades[u])
    return " e ".join(res)

def _data_por_extenso(data_str: str) -> str:
    meses = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    if not data_str:
        return ""
    try:
        if '-' in data_str:
            partes = data_str.split('-')
            dia, mes, ano = int(partes[2]), int(partes[1]), int(partes[0])
        elif '/' in data_str:
            partes = data_str.split('/')
            dia, mes, ano = int(partes[0]), int(partes[1]), int(partes[2])
        else:
            return data_str
        return f"{dia:02d} de {meses[mes]} de {ano}"
    except Exception:
        return data_str

def montar(modelo_json: str) -> dict:
    import json
    dados_usuario = json.loads(modelo_json)
    resultado = {}

    for chave, valor in dados_usuario.items():
        chave_limpa = chave.strip("{}")
        if chave_limpa in CHAVES_RAW or chave in CHAVES_RAW:
            continue
            
        if isinstance(valor, str) and re.match(r'^\d{4}-\d{2}-\d{2}$', valor.strip()):
            partes = valor.strip().split('-')
            valor = f"{partes[2]}/{partes[1]}/{partes[0]}"
            
        resultado[chave] = valor
    
    amostra_check = _converter_para_sim(dados_usuario.get("{{AMOSTRA_CHECK}}", "NAO"))
    resultado["__REMOVER_AMOSTRA__"] = not amostra_check
    if amostra_check:
        resultado["{{AMOSTRA}}"] = dados_usuario.get("{{AMOSTRA_TXT}}", "")
    else:
        resultado["{{AMOSTRA}}"] = ""

    vistoria_check = _converter_para_sim(dados_usuario.get("{{VISTORIA_CHECK}}", "NAO"))
    resultado["__REMOVER_VISTORIA__"] = not vistoria_check
    if vistoria_check:
        resultado["{{VISTORIA}}"] = dados_usuario.get("{{VISTORIA_TXT}}", "")
    else:
        resultado["{{VISTORIA}}"] = ""
        
    resultado["{{DOTACAO}}"] = dados_usuario.get("{{DOTACAO}}", "")
    
    tipo_objeto = dados_usuario.get("{{TIPO_OBJETO}}", "AQUISICAO")
    if tipo_objeto == "SERVICO":
        resultado["{{PRAZO PUB}}"] = ("(...)\n""II - no caso de serviços e obras:\n""***10 (dez) dias úteis***, quando adotados os critérios de julgamento de menor preço ou de maior desconto, no caso de serviços comuns e de obras e serviços comuns de engenharia; (grifo nosso)")
        resultado["{{UNID}}"] = "__REMOVER_COLUNA__"
    else:
        resultado["{{PRAZO PUB}}"] = ("I - para aquisição de bens:\n""***8 (oito) dias úteis***, quando adotados os critérios de julgamento de menor preço ou de maior desconto; (grifo nosso)")
        resultado["{{UNID}}"] = "MARCA/MODELO"

    arq_mag = _converter_para_sim(dados_usuario.get("{{ARQ_MAG_CHECK}}", "NAO"))
    if arq_mag:
        resultado["{{ARQ MAG}}"] = "Adicionalmente, o licitante deverá OBRIGATORIAMNETE preencher o arquivo magnético e armazená-lo em um pen-drive próprio, às suas custas, INDEPENDENTEMENTE DE QUANTOS ITENS FOR PARTICIPAR, devendo ele estar acondicionado dentro do envelope “01 – PROPOSTA COMERCIAL” junto com a proposta impressa.\n\tA instrução de acondicionar o pen-drive dentro do envelope vista orientar licitantes que somente enviem suas propostas via Correios. No caso de licitantes credenciados, poderá ser aceito a entrega do arquivo magnético em mãos, fora do envelope.\nO arquivo para preenchimento estará disponível, junto com o tutorial, no site da prefeitura municipal, em link próprio, junto del presente Edital, com o nome “ARQUIVO MAGNÉTICO”.\nCaso haja necessidade, o licitante poderá solicitar o arquivo magnético para preenchimento previamente à sessão pública, junto com o tutorial, no e-mail licitacao@saofrancisco.sp.gov.br.\nQuaisquer dúvidas sobre o funcionamento do arquivo magnético deverão ser dirimidas ANTES da sessão pública por meio do telefone (17) 3693-1101 ou e-mail licitacao@saofrancisco.sp.gov.br."
        resultado["{{ARQ MAG 2}}"] = "ou operar o arquivo magnético"
        resultado["{{ARQ MAG 3}}"] = "ou arquivo magnético"
    else:
        resultado["{{ARQ MAG}}"] = ""
        resultado["{{ARQ MAG 2}}"] = ""
        resultado["{{ARQ MAG 3}}"] = ""

    instrumento_raw = dados_usuario.get("{{INSTRUMENTO}}", "CONTRATO")
    resultado["E_ARP"] = True if instrumento_raw == "ATA" else False
    resultado["APENAS_CONTRATO"] = instrumento_raw != "ATA"

    modalidade_raw = dados_usuario.get("{{MODALIDADE}}", "PREGAO_ELETRONICO")

    prorroga_check = dados_usuario.get("{{PRORROGACAO_CHECK}}", "NAO")
    sim_prorroga = _converter_para_sim(prorroga_check)

    if not sim_prorroga:
        texto_prorrogacao = "será improrrogável"
        texto_prorrogacao2 = "será improrrogável"
        texto_prorroga_sn = "Não"
    else:
        texto_prorroga_sn = "Sim"
        if instrumento_raw == "ATA":
            texto_prorrogacao = "podendo ser prorrogado por igual período, nos termos do art. 84 da Lei Federal nº 14.133/2021"
            texto_prorrogacao2 = texto_prorrogacao
        else:
            texto_prorrogacao = "podendo ser prorrogado por igual período, nos termos dos arts. 106 e 107 da Lei Federal nº 14.133/2021, e art. 68 do Decreto Municipal nº 2056/24"
            texto_prorrogacao2 = "podendo ser prorrogado por igual período, nos termos do art. 84 da Lei Federal nº 14.133/2021"

    resultado["{{PRORROGA_CLAUS}}"] = ""
    resultado["{{PRORROGA}}"] = texto_prorrogacao
    resultado["{{PRORROGACAO}}"] = texto_prorrogacao
    resultado["{{PRORROGACAO2}}"] = texto_prorrogacao2
    resultado["{{PRORROGA_SN}}"] = texto_prorroga_sn

    meepp = dados_usuario.get("{{ME_EPP}}", "NAO")
    resultado["{{ME_EPP_TR}}"] = ""

    resultado["{{ME_EPP}}"] = (
        "Exclusiva para ME/EPP" if _converter_para_sim(meepp)
        else "Não exclusiva para ME/EPP"
    )

    criterio_raw = str(dados_usuario.get("{{CRITERIOS}}", dados_usuario.get("{{CRITERIO}}", "ITEM"))).strip().upper()
    if criterio_raw == "ITEM":
        resultado["{{CRITERIO}}"] = "POR ITEM"
        resultado["{{LOTE}}"] = ""
    elif criterio_raw == "LOTE":
        resultado["{{CRITERIO}}"] = "POR LOTE"
        resultado["{{LOTE}}"] = "Quando a licitação se der por lote, o Pregoeiro convocará o licitante vencedor para readequar, INCLUSIVE e ESPECIALMENTE, os values unitários.\n\tO Pregoeiro estipulará o prazo para readequação de que trata este item, conforme a complexidade do objeto."
    elif criterio_raw == "GLOBAL":
        resultado["{{CRITERIO}}"] = "GLOBAL"
        resultado["{{LOTE}}"] = ""
    else:
        resultado["{{CRITERIO}}"] = criterio_raw
        resultado["{{LOTE}}"] = ""

    gestores_str = dados_usuario.get("{{GESTOR}}", "")
    cargos_gestores_str = dados_usuario.get("{{GESTOR_CARGO}}", "")
    fiscais_str = dados_usuario.get("{{FISCAL}}", "")
    cargos_fiscais_str = dados_usuario.get("{{FISCAL_CARGO}}", "")

    resultado["{{GESTOR}}"] = _formatar_nomes_com_sufixo(gestores_str, cargos_gestores_str, "Gestor")
    resultado["{{FISCAL}}"] = _formatar_nomes_com_sufixo(fiscais_str, cargos_fiscais_str, "Fiscal")

    blocos_ges_fis = []
    blocos_ges_ass = []

    if gestores_str and gestores_str != "[Não informado]":
        nomes_g = [n.strip() for n in gestores_str.split(",") if n.strip()]
        cargos_g = [c.strip() for c in cargos_gestores_str.split(",") if c.strip()]
        for i, nome in enumerate(nomes_g):
            cargo = cargos_g[i] if i < len(cargos_g) else ""
            bloco = f"**GESTOR:**\nNome: {nome}\nCargo (se for o caso): {cargo}\nCPF:\n\n**Assinatura: ______________________________________________________**\n"
            blocos_ges_fis.append(bloco)
            blocos_ges_ass.append(f"\n\n_____________________________\n{nome}\nGESTOR\n ")

    blocos_fis_ass = []

    if fiscais_str and fiscais_str != "[Não informado]":
        nomes_f = [n.strip() for n in fiscais_str.split(",") if n.strip()]
        cargos_f = [c.strip() for c in cargos_fiscais_str.split(",") if c.strip()]
        for i, nome in enumerate(nomes_f):
            cargo = cargos_f[i] if i < len(cargos_f) else ""
            bloco = f"**FISCAL:**\nNome: {nome}\nCargo (se for o caso): {cargo}\nCPF:\n\n**Assinatura: ______________________________________________________**\n"
            blocos_ges_fis.append(bloco)
            blocos_fis_ass.append(f"\n\n_____________________________\n{nome}\nFISCAL\n ")

    resultado["{{GES.FIS.ANEXOS}}"] = "\n".join(blocos_ges_fis) if blocos_ges_fis else ""
    resultado["{{GES.ASS}}"] = "\n".join(blocos_ges_ass) if blocos_ges_ass else ""
    resultado["{{FIS.ASS}}"] = "\n".join(blocos_fis_ass) if blocos_fis_ass else ""

    resultado["{{GESTORES}}"] = (
        "; ".join(_formatar_lista_assinaturas(gestores_str, cargos_gestores_str))
        if gestores_str and gestores_str != "[Não informado]"
        else "[Não informado]"
    )

    hora_sessao = dados_usuario.get("{{HORA_SESSAO}}", "")
    if not hora_sessao and "{{HORA SESSAO}}" in dados_usuario:
        hora_sessao = dados_usuario["{{HORA SESSAO}}"]
        
    if hora_sessao:
        resultado["{{HORA SESSAO}}"] = _formatar_hora_min(hora_sessao)
        resultado["{{HORA_SESSAO}}"] = _formatar_hora_min(hora_sessao)
        resultado["{{HORA FIM DO REC}}"] = _subtrair_15_min(hora_sessao)
        
        if modalidade_raw == "PREGAO_PRESENCIAL":
            resultado["{{HORA INICIO CRED}}"] = _subtrair_15_min(hora_sessao)
        else:
            resultado["{{HORA INICIO CRED}}"] = ""

    if modalidade_raw == "DISPENSA":
        data_sessao = resultado.get("{{DATA DA SESSAO}}", dados_usuario.get("{{DATA DA SESSAO}}", ""))
        if data_sessao:
            resultado["{{DATA DA SESSAO2}}"] = _dia_util_anterior(data_sessao)
        resultado["{{HORA FIM DO REC}}"] = "23h59min"

    decl_adicionais = dados_usuario.get("{{DECL.ADICIONAIS}}", "")
    resultado["{{DECL.ADICIONAIS}}"] = decl_adicionais

    contratante_str = dados_usuario.get("{{CONTRATANTE}}", "")
    resultado["{{CONTRATANTE}}"] = contratante_str

    contratada_str = dados_usuario.get("{{CONTRATADA}}", "")
    resultado["{{CONTRATADA}}"] = contratada_str

    vigencia = dados_usuario.get("{{VIGENCIA}}", "")
    resultado["{{VIGENCIA}}"] = vigencia

    execucao = resultado.get("{{EXECUCAO}}", resultado.get("EXECUCAO", ""))
    resultado["{{EXECUCAO}}"] = execucao

    prazo_dev = resultado.get("{{PRAZO DEVOLUCAO}}", resultado.get("PRAZO DEVOLUCAO", ""))
    if prazo_dev:
        try:
            num_match = re.search(r'\d+', str(prazo_dev))
            if num_match:
                num = int(num_match.group())
                extenso = _numero_por_extenso(num)
                resultado["{{PRAZO DEVOLUCAO}}"] = f"{num} ({extenso})"
            else:
                resultado["{{PRAZO DEVOLUCAO}}"] = str(prazo_dev)
        except Exception:
            resultado["{{PRAZO DEVOLUCAO}}"] = str(prazo_dev)

    esp_esp = resultado.get("{{ESPECIFICACOES ESPECIAIS}}", resultado.get("ESPECIFICACOES ESPECIAIS", ""))
    resultado["{{ESPECIFICACOES ESPECIAIS}}"] = esp_esp

    data_edital = resultado.get("{{DATA DO EDITAL}}", resultado.get("DATA DO EDITAL", ""))
    if data_edital:
        resultado["{{DATA DO EDITAL}}"] = _data_por_extenso(data_edital)

    valor_raw = dados_usuario.get("{{VALOR}}", dados_usuario.get("VALOR", ""))
    if valor_raw:
        valor_float = _limpar_valor_numerico(valor_raw)
        if valor_float > 0:
            str_val = _formatar_valor(valor_float)
            str_ext = _valor_por_extenso(valor_float)
            resultado["{{VALOR}}"] = f"R$ {str_val} ({str_ext})"
            resultado["{{VALOR EXT}}"] = str_ext
        else:
            resultado["{{VALOR}}"] = str(valor_raw)
            resultado["{{VALOR EXT}}"] = ""
    else:
        resultado["{{VALOR}}"] = ""
        resultado["{{VALOR EXT}}"] = ""

    exclusivo_raw = dados_usuario.get("{{EXCLUSIVO}}", "NAO")
    if _converter_para_sim(exclusivo_raw):
        resultado["{{EXCLUSIVO}}"] = "SIM"
        resultado["{{EXCLUSIVO TXT}}"] = "Nos termos do art. 47 e 48 da LCP 123/2006, que versa que a Administração Pública “deverá realizar processo licitatório destinado exclusivamente à participação de microempresas e empresas de pequeno porte nos itens de contratação cujo valor seja de até R$ 80.000,00 (oitenta mil reais)”, e considerando ainda que este tipo de contratação é comumente realizado por empresas de pequeno porte em valores de mercado, hipótese no qual não haverá risco de oportunidade significativos, ***esta licitação SERÁ exclusiva para ME/EPP.***"
    else:
        resultado["{{EXCLUSIVO}}"] = "NÃO"
        resultado["{{EXCLUSIVO TXT}}"] = "Nos termos do art. 47, 48 e 49 da LCP 123/2006, que versa que “o tratamento diferenciado e simplificado para as microempresas e empresas de pequeno porte” pode ser afastado quando “não for vantajoso para a administração pública ou representar prejuízo ao conjunto ou complexo do objeto a ser contratado” e, considerando ainda a justificativa apresentada no bojo do Estudo Técnico Preliminar e no Termo de referência, ***esta licitação NÃO será exclusiva para ME/EPP, sendo concedido, porém, o benefício do empate ficto e demais tratamentos diferenciados para tais empresas.***"

    return {k: v for k, v in resultado.items() if (k.startswith("{{") and k.endswith("}}")) or k == "E_ARP" or k.startswith("__")}