export type TipoTesteContratacao = "normal" | "direta";

const criarItem = (numero: number, descricao: string, un: string, qtd: number, valor: number) => ({
  id: Date.now() + numero + Math.random(),
  numero,
  descricao,
  un,
  qtd,
  valor,
});

export const criarDadosTeste = (tipo: TipoTesteContratacao) => {
  const direta = tipo === "direta";
  const secretaria = "Secretaria de Administração";

  return {
    objeto: direta
      ? "Aquisição de materiais de expediente para atendimento das unidades administrativas"
      : "Registro de preços para aquisição de materiais de expediente para atendimento das unidades administrativas",
    necessidade: direta
      ? "A contratação é necessária para reposição do estoque de materiais de expediente e continuidade das atividades administrativas, considerando a necessidade imediata de atendimento das unidades municipais."
      : "A contratação é necessária para assegurar o abastecimento regular de materiais de expediente das unidades municipais, evitando descontinuidade das atividades administrativas e permitindo planejamento de consumo ao longo da vigência.",
    itens: [
      criarItem(1, "Papel sulfite A4, 75 g/m², branco, resma com 500 folhas", "RESMA", direta ? 10 : 30, 32.5),
      criarItem(2, "Caneta esferográfica azul, corpo transparente, ponta média", "CX", direta ? 5 : 15, 28.9),
    ],
    amostra: false,
    vistoria: false,
    execucao: direta
      ? "Entrega integral no prazo máximo de 10 dias corridos após o recebimento da autorização de fornecimento, no almoxarifado municipal, em horário comercial. Os materiais deverão ser entregues novos, sem avarias e em conformidade com as especificações do objeto, ficando sujeitos à conferência e aceitação da Administração."
      : "As entregas serão realizadas de forma parcelada, conforme solicitações da Administração, no prazo máximo de 10 dias corridos após cada autorização de fornecimento, no almoxarifado municipal, em horário comercial. Os materiais deverão ser entregues novos, sem avarias e em conformidade com as especificações do objeto, ficando sujeitos à conferência e aceitação da Administração.",
    secretarias: [secretaria],
    contatosSecretarias: {
      [secretaria]: [
        { email: "teste@municipio.local", tel: "(17) 0000-0000" },
      ],
    },
    gestores: [
      { nome: "GESTOR DE TESTE", cargo: "Servidor responsável pela gestão" },
    ],
    fiscais: [
      { nome: "FISCAL DE TESTE", cargo: "Servidor responsável pela fiscalização" },
    ],
    instrumento: direta ? "SEM_CONTRATO" : "CONTRATO",
    prorrogar: !direta,
    meepp: "SIM",
    criterio: "ITEM",
    motivoCriterio: "",
    modalidade: direta ? "DISPENSA_BLL" : "PREGAO_ELETRONICO",
    motivoModalidade: direta
      ? "Contratação direta por dispensa de licitação, utilizando procedimento eletrônico com disputa de lances, em razão do pequeno valor e conforme o enquadramento legal aplicável."
      : "",
    pac: "SIM",
    motivoPac: "",
    vigenciaNum: 12,
    vigenciaUnidade: "Meses",
    dotacao: "02.01.04.122.0001.2001 - 3.3.90.30 - Material de Consumo",
    caminhoImagemDotacao: "",
  };
};
