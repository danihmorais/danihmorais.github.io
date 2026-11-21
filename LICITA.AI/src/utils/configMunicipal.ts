import configuracoesMunicipais from "../../config/municipios.json";

export interface ConfigMunicipalPublica {
  municipio: {
    id: string;
    nome: string;
    uf: string;
    display: string;
    decreto: string;
    campos: Record<string, string>;
  };
  limite_exclusividade_me_epp_centavos: number;
}

const municipioPadraoId = configuracoesMunicipais.municipio_padrao as keyof typeof configuracoesMunicipais.municipios;
const municipioPadrao = configuracoesMunicipais.municipios[municipioPadraoId];
const limitePadrao = municipioPadrao.parametros?.limite_exclusividade_me_epp_centavos
  ?? configuracoesMunicipais.parametros.limite_exclusividade_me_epp_centavos;

const CONFIG_PADRAO: ConfigMunicipalPublica = {
  municipio: {
    id: municipioPadrao.id,
    nome: municipioPadrao.nome,
    uf: municipioPadrao.uf,
    display: municipioPadrao.uf ? `${municipioPadrao.nome}/${municipioPadrao.uf}` : municipioPadrao.nome,
    decreto: municipioPadrao.decreto,
    campos: {
      nome_completo: municipioPadrao.campos.nome_completo || `Prefeitura Municipal de ${municipioPadrao.nome}`,
      endereco_prefeitura: municipioPadrao.campos.endereco_prefeitura || "",
      telefone: municipioPadrao.campos.telefone || "",
      email_licitacao: municipioPadrao.campos.email_licitacao || "",
    },
  },
  limite_exclusividade_me_epp_centavos: limitePadrao,
};

let configMunicipalAtiva = CONFIG_PADRAO;

export function definirConfigMunicipal(config: ConfigMunicipalPublica | null | undefined): void {
  if (!config || !config.municipio || !Number.isFinite(config.limite_exclusividade_me_epp_centavos) || config.limite_exclusividade_me_epp_centavos <= 0) return;
  configMunicipalAtiva = config;
}

export function obterConfigMunicipal(): ConfigMunicipalPublica {
  return configMunicipalAtiva;
}

export function obterLimiteMeepp(): number {
  return configMunicipalAtiva.limite_exclusividade_me_epp_centavos / 100;
}

export function formatarLimiteMeeppConfigurado(): string {
  return obterLimiteMeepp().toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function obterTagsMunicipais(): Record<string, string> {
  const config = configMunicipalAtiva;
  const campos = config.municipio.campos || {};
  return {
    "{{MUNICIPIO}}": config.municipio.nome,
    "{{MUNICIPIO_UF}}": config.municipio.display,
    "{{PREFEITURA}}": campos.nome_completo || `Prefeitura Municipal de ${config.municipio.nome}`,
    "{{ENDERECO_PREFEITURA}}": campos.endereco_prefeitura || "",
    "{{TELEFONE}}": campos.telefone || "",
    "{{EMAIL_LICITACAO}}": campos.email_licitacao || "",
    "{{DECRETO}}": config.municipio.decreto || "",
    "{{LIMITE_ME_EPP}}": formatarLimiteMeeppConfigurado(),
  };
}
