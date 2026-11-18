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

const CONFIG_PADRAO: ConfigMunicipalPublica = {
  municipio: {
    id: "sao-francisco-sp",
    nome: "São Francisco",
    uf: "SP",
    display: "São Francisco/SP",
    decreto: "Decreto Municipal nº 2.056/2024",
    campos: {
      nome_completo: "Prefeitura Municipal de São Francisco",
      endereco_prefeitura: "Av. Oscar Antônio da Costa, 1187, CEP 15710-011, São Francisco/SP",
      telefone: "(17) 3693-1101",
      email_licitacao: "licitacao@saofrancisco.sp.gov.br",
    },
  },
  limite_exclusividade_me_epp_centavos: 8000000,
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
