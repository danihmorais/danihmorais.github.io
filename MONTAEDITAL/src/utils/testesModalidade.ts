export type ModalidadeTeste =
  | "PREGAO_ELETRONICO"
  | "PREGAO_PRESENCIAL"
  | "DISPENSA"
  | "DISPENSA_BLL"
  | "LEILAO_ELETRONICO";

export const MODALIDADES_TESTE: ReadonlyArray<{
  value: ModalidadeTeste;
  label: string;
  descricao: string;
}> = [
  {
    value: "PREGAO_ELETRONICO",
    label: "Pregão Eletrônico",
    descricao: "Item • aquisição • contrato",
  },
  {
    value: "PREGAO_PRESENCIAL",
    label: "Pregão Presencial",
    descricao: "Lote • aquisição • arquivo magnético",
  },
  {
    value: "DISPENSA",
    label: "Dispensa por E-Mail",
    descricao: "Global • contrato • procedimento completo",
  },
  {
    value: "DISPENSA_BLL",
    label: "Dispensa Eletrônica BLL",
    descricao: "Item • contrato • procedimento completo",
  },
  {
    value: "LEILAO_ELETRONICO",
    label: "Leilão Eletrônico",
    descricao: "Maior preço por item • sem contrato",
  },
];

const DOCX_TESTE_B64 =
  "UEsDBBQAAAAIACSTOF0XmADX6wAAALIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU4DMQy98xWRr2gmAweEUKc9sByBQ/kAK/HMRM2mOC3t3+NpoQdUONpvs99itQ9e7aiwS7GHm7YDRdEk6+LYw8f6pbkHxRWjRZ8i9XAghtXyarE+ZGIl4sg9TLXmB63ZTBSQ25QpCjKkErDKWEad0WxwJH3bdXfapFgp1qbOHiBmTzTg1lf1vJf96ZJCnkE9nphzWA+Ys3cGq+B6F+2vmOY7ohXlkcOTy3wtBNCXI2bo74Qf4ZuUU5wl9Y6lvmIQmv5MxWqbzDaItP3f58KlaRicobN+dsslGWKW1oNvz0hAF88f6GPlyy9QSwMEFAAAAAgAJJM4XT+t/vqvAAAALAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwA0J1TRN5pWgaEUEMXhNQVlQNEiZtWNB/F4dPbk4EBKgZG/57tunnaid0x0uidgKoogaFTXo/OCLh0p/UOGCXptJy8QwEzEjSHVX3GSaY8Q8MYiGXEkYAhpbDnnNSAVlLhA7pc6X20MuUwGh6kukqDfFOWWx4/DVigrNUCYqsrYN0c8B/c9/2o8OjVzaJLP3YsOrIso8Ek4OGj5vqdLjILPJ/Dv548vABQSwMEFAAAAAgAJJM4Xfh7tNb2AAAAZwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbEVQXU+DMBR9369o+i4FXQgSYCFRExOnJuIP6OgdkNBebO+G89fbomQvp+fcj3PaFrtvPbIzWDegKXkSxZyBaVENpiv5Z/N0k3HmSBolRzRQ8gs4vqs2xZwrbE8aDDHvYFw+l7wnmnIhXNuDli7CCYzvHdFqSV7aTsxo1WSxBed8gB7FbRynQsvB8MXzgOpS+XMKYANQVduv03BGpoAROAKmkO3fXpuaPT48N/VLVIgwFtAuuCw7aOl9cZi6jx82h/slyX2ccs97z9PsLuPib2Avra8STr6+3cZhxA5dT1d5QCLUVz3Cce2KJXTNE/+P2AS2flH1C1BLAQIUAxQAAAAIACSTOF0XmADX6wAAALIBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAJJM4XT+t/vqvAAAALAEAAAsAAAAAAAAAAAAAAIABHAEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAJJM4Xfh7tNb2AAAAZwEAABEAAAAAAAAAAAAAAIAB9AEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAABkDAAAAAA==";

function dataRelativa(dias: number): string {
  const data = new Date();
  data.setHours(12, 0, 0, 0);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function criarArquivoTeste(nome: string): File {
  const binario = atob(DOCX_TESTE_B64);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }

  return new File(
    [bytes],
    nome,
    { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  );
}

export function criarDadosTeste(modalidade: ModalidadeTeste) {
  const dataAutorizacao = dataRelativa(-5);
  const dataTr = dataRelativa(-4);
  const dataModalidade = dataRelativa(-3);
  const dataDotacao = dataRelativa(-2);
  const dataPedParecer = dataRelativa(-1);
  const dataEdital = dataRelativa(1);
  const dataRecProp1 = dataRelativa(1);
  const dataSessao = dataRelativa(7);

  const base = {
    numeroProcesso: "42/2026",
    numeroModalidade: "58/2026",
    modalidade,
    criterios: modalidade === "LEILAO_ELETRONICO" ? "ITEM" : "ITEM",
    tipoObjeto: "AQUISICAO",
    instrumento: modalidade === "LEILAO_ELETRONICO" ? "SEM_CONTRATO" : "CONTRATO",
    dotacao: "",
    dotacaoImagens: [],
    dotacaoBlocos:
      modalidade === "LEILAO_ELETRONICO"
        ? []
        : [{ tipo: "texto" as const, texto: "**01.01.01** – Dotação orçamentária de teste." }],
    quantidadeItens: "2",
    quantidadeLotes: "1",
    arquivoMagnetico: modalidade === "PREGAO_PRESENCIAL",
    dataEdital,
    dataSessao,
    horaSessao: "09:00",
    dataRecProp1,
    objeto:
      modalidade === "LEILAO_ELETRONICO"
        ? "Alienação de bem móvel municipal de teste para validação do fluxo do Leilão Eletrônico."
        : "Aquisição de materiais e serviços para teste completo do gerador de editais.",
    gestores: [{ nome: "JOÃO DA SILVA TESTE", cargo: "Gestor do contrato" }],
    fiscais: [{ nome: "MARIA DE SOUZA TESTE", cargo: "Fiscal do contrato" }],
    execucao:
      modalidade === "LEILAO_ELETRONICO"
        ? ""
        : "A execução deverá observar as condições, prazos e demais exigências previstas no Termo de Referência de teste.",
    prazoDevolucao: modalidade === "LEILAO_ELETRONICO" ? "" : "5",
    especificacoesEspeciais: "",
    vistoria: modalidade === "LEILAO_ELETRONICO",
    textoVistoria:
      modalidade === "LEILAO_ELETRONICO"
        ? "A vistoria e a visitação do bem poderão ocorrer em horário previamente agendado com a Administração."
        : "",
    amostra: false,
    textoAmostra: "",
    vigencia: modalidade === "LEILAO_ELETRONICO" ? "" : "12 meses",
    documentosAdicionais: [],
    declAdicionais: "",
    contratante:
      modalidade === "LEILAO_ELETRONICO"
        ? ""
        : "A contratante deverá acompanhar a execução, prestar as informações necessárias e fiscalizar o cumprimento das obrigações.",
    contratada:
      modalidade === "LEILAO_ELETRONICO"
        ? ""
        : "A contratada deverá executar o objeto conforme as especificações, prazos e condições definidos no Termo de Referência.",
    pagamento:
      modalidade === "LEILAO_ELETRONICO"
        ? ""
        : "O pagamento será efetuado após o atesto da nota fiscal e o cumprimento das condições previstas no instrumento.",
    retirada:
      modalidade === "LEILAO_ELETRONICO"
        ? "Pátio Municipal de São Francisco-SP, em data e horário previamente agendados, após a confirmação do pagamento."
        : "",
    valor: "R$ 12.500,00",
    exclusivo: "NAO",
    dataAutorizacao,
    secretaria: "Diversos",
    dataTr,
    servidorProcedimento: "FERNANDA REGINA YONEZAWA SHIMADA",
    dataModalidade,
    justificativaProcedimento:
      modalidade === "PREGAO_PRESENCIAL"
        ? "A forma presencial é adotada para o teste do procedimento e para validação do fluxo específico desta modalidade."
        : "",
    dataDotacao,
    dataPedParecer,
    prorrogacaoCheck: modalidade === "LEILAO_ELETRONICO" ? "NAO" : "SIM",
    itens: [],
    arquivoDfd: criarArquivoTeste("DFD - TESTE.docx"),
    arquivoEtp: criarArquivoTeste("ETP - TESTE.docx"),
    arquivoTr: criarArquivoTeste("TR - TESTE.docx"),
  };

  const prefixos: Record<ModalidadeTeste, { processo: string; edital: string }> = {
    PREGAO_ELETRONICO: { processo: "42/2026", edital: "58/2026" },
    PREGAO_PRESENCIAL: { processo: "43/2026", edital: "59/2026" },
    DISPENSA: { processo: "44/2026", edital: "60/2026" },
    DISPENSA_BLL: { processo: "45/2026", edital: "61/2026" },
    LEILAO_ELETRONICO: { processo: "46/2026", edital: "62/2026" },
  };

  return {
    ...base,
    numeroProcesso: prefixos[modalidade].processo,
    numeroModalidade: prefixos[modalidade].edital,
  };
}
