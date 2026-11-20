import React, { useEffect, useMemo, useState } from "react";
import {
  pesquisarPrecosPNCP,
  type PesquisaPrecosPNCPResultado,
  type PesquisaPrecosPNCPResposta,
} from "../api";

type ItemPesquisa = {
  id: string | number;
  numero?: number | string;
  descricao?: string;
  un?: string;
};

type Props = {
  itens: ItemPesquisa[];
  onAplicarPreco: (itemId: string | number, valor: number) => void;
};

const MODALIDADES = [
  { id: 4, nome: "Concorrência eletrônica" },
  { id: 6, nome: "Pregão eletrônico" },
  { id: 8, nome: "Dispensa de licitação" },
];

function dataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor: number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(valor: string): string {
  if (!valor) return "Não informada";
  const dataTexto = String(valor).slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataTexto);
  const data = partes
    ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
    : new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function CartaoPreco({
  preco,
  aoAplicar,
}: {
  preco: PesquisaPrecosPNCPResultado;
  aoAplicar: () => void;
}) {
  const homologado = preco.tipo_preco === "homologado";
  return (
    <article className="pncp-price-card">
      <div className="pncp-price-card-heading">
        <span className={homologado ? "pncp-price-kind is-homologated" : "pncp-price-kind is-estimated"}>
          {homologado ? "Preço homologado" : "Valor estimado do edital"}
        </span>
        <strong className="pncp-price-value">{formatarMoeda(preco.valor_unitario)}</strong>
        <span className="pncp-price-unit">por {preco.unidade || "unidade não informada"}</span>
      </div>
      <p className="pncp-price-description">{preco.descricao_item}</p>
      <dl className="pncp-price-metadata">
        {preco.orgao && <div><dt>Órgão</dt><dd>{preco.orgao}</dd></div>}
        {(preco.municipio || preco.uf) && <div><dt>Localidade</dt><dd>{[preco.municipio, preco.uf].filter(Boolean).join("/")}</dd></div>}
        {preco.modalidade && <div><dt>Modalidade</dt><dd>{preco.modalidade}</dd></div>}
        <div><dt>Data de referência</dt><dd>{formatarData(preco.data_referencia)}</dd></div>
        {preco.quantidade !== null && preco.quantidade !== undefined && <div><dt>Quantidade</dt><dd>{Number(preco.quantidade).toLocaleString("pt-BR")}</dd></div>}
        {preco.numero_controle_pncp && <div><dt>Controle PNCP</dt><dd>{preco.numero_controle_pncp}</dd></div>}
      </dl>
      {!preco.unidade_compativel && (
        <p className="pncp-price-warning" role="note">
          A unidade da contratação de origem difere da unidade do item atual. Não aplique este valor automaticamente.
        </p>
      )}
      <div className="pncp-price-card-actions">
        {preco.url_fonte && (
          <a href={preco.url_fonte} target="_blank" rel="noreferrer" className="pncp-source-link">
            Abrir contratação no PNCP
          </a>
        )}
        <button type="button" className="button button-secondary" disabled={!preco.unidade_compativel} onClick={aoAplicar}>
          Aplicar ao item
        </button>
      </div>
    </article>
  );
}

export default function PesquisaPrecosPNCP({ itens, onAplicarPreco }: Props) {
  const itensDisponiveis = useMemo(
    () => (Array.isArray(itens) ? itens.filter(item => String(item.descricao || "").trim()) : []),
    [itens],
  );
  const [itemId, setItemId] = useState("");
  const [dataFinal, setDataFinal] = useState(() => dataLocal(new Date()));
  const [dataInicial, setDataInicial] = useState(() => {
    const data = new Date();
    data.setDate(data.getDate() - 365);
    return dataLocal(data);
  });
  const [uf, setUf] = useState("");
  const [modalidades, setModalidades] = useState<number[]>([4, 6, 8]);
  const [incluirEstimados, setIncluirEstimados] = useState(true);
  const [resposta, setResposta] = useState<PesquisaPrecosPNCPResposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [avisoAplicacao, setAvisoAplicacao] = useState("");

  useEffect(() => {
    if (!itensDisponiveis.length) {
      setItemId("");
      return;
    }
    if (!itensDisponiveis.some(item => String(item.id) === itemId)) {
      setItemId(String(itensDisponiveis[0].id));
    }
  }, [itensDisponiveis, itemId]);

  const itemSelecionado = itensDisponiveis.find(item => String(item.id) === itemId);

  const alternarModalidade = (id: number, ativo: boolean) => {
    setModalidades(atual => ativo
      ? Array.from(new Set([...atual, id])).sort((a, b) => a - b)
      : atual.filter(valor => valor !== id));
  };

  const pesquisar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!itemSelecionado) {
      setErro("Selecione um item com descrição preenchida.");
      return;
    }
    if (modalidades.length === 0) {
      setErro("Selecione ao menos uma modalidade de contratação.");
      return;
    }
    setCarregando(true);
    setErro("");
    setAvisoAplicacao("");
    setResposta(null);
    try {
      const resultado = await pesquisarPrecosPNCP({
        descricao: String(itemSelecionado.descricao || "").trim(),
        unidade: String(itemSelecionado.un || "").trim(),
        data_inicial: dataInicial,
        data_final: dataFinal,
        uf: uf || undefined,
        modalidades,
        incluir_estimados: incluirEstimados,
      });
      setResposta(resultado);
    } catch (falha: any) {
      setErro(falha?.message || "Não foi possível consultar o PNCP agora.");
    } finally {
      setCarregando(false);
    }
  };

  const aplicar = (preco: PesquisaPrecosPNCPResultado) => {
    if (!itemSelecionado || !preco.unidade_compativel) return;
    onAplicarPreco(itemSelecionado.id, preco.valor_unitario);
    setAvisoAplicacao(`Valor unitário de ${formatarMoeda(preco.valor_unitario)} aplicado ao item ${itemSelecionado.numero || ""}.`);
  };

  if (itensDisponiveis.length === 0) return null;

  return (
    <section className="pncp-price-research" aria-labelledby="pncp-price-research-title">
      <details>
        <summary id="pncp-price-research-title">Pesquisar referências de preços no PNCP</summary>
        <div className="pncp-price-research-content">
          <p className="pncp-price-intro">
            Consulte itens de contratações publicadas no PNCP e compare preços unitários homologados. A pesquisa é auxiliar e não substitui a pesquisa de preços nem a análise de compatibilidade do objeto.
          </p>
          <form className="pncp-price-form" onSubmit={pesquisar}>
            <label>
              Item da contratação
              <select value={itemId} onChange={evento => { setItemId(evento.target.value); setResposta(null); }}>
                {itensDisponiveis.map(item => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {item.numero ? `Item ${item.numero} — ` : ""}{item.descricao}
                  </option>
                ))}
              </select>
            </label>
            <div className="pncp-price-date-fields">
              <label>
                Publicação inicial
                <input type="date" value={dataInicial} max={dataFinal} onChange={evento => setDataInicial(evento.target.value)} required />
              </label>
              <label>
                Publicação final
                <input type="date" value={dataFinal} min={dataInicial} max={dataLocal(new Date())} onChange={evento => setDataFinal(evento.target.value)} required />
              </label>
            </div>
            <label>
              Unidade federativa
              <select value={uf} onChange={evento => setUf(evento.target.value)}>
                <option value="">Todas as UFs</option>
                {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(sigla => (
                  <option key={sigla} value={sigla}>{sigla}</option>
                ))}
              </select>
            </label>
            <fieldset className="pncp-price-modalities">
              <legend>Modalidades consultadas</legend>
              {MODALIDADES.map(modalidade => (
                <label key={modalidade.id}>
                  <input
                    type="checkbox"
                    checked={modalidades.includes(modalidade.id)}
                    onChange={evento => alternarModalidade(modalidade.id, evento.target.checked)}
                  />
                  {modalidade.nome}
                </label>
              ))}
            </fieldset>
            <label className="pncp-price-estimated-toggle">
              <input type="checkbox" checked={incluirEstimados} onChange={evento => setIncluirEstimados(evento.target.checked)} />
              Incluir valores estimados quando não houver resultado homologado para o item
            </label>
            <button type="submit" className="button button-primary" disabled={carregando || !itemSelecionado}>
              {carregando ? "Consultando PNCP..." : "Pesquisar preços"}
            </button>
          </form>
          {erro && <p className="pncp-price-error" role="alert">{erro}</p>}
          {avisoAplicacao && <p className="pncp-price-success" role="status">{avisoAplicacao}</p>}
          {resposta && (
            <div className="pncp-price-results">
              <div className="pncp-price-results-heading">
                <strong>{resposta.total} referência(s) encontradas</strong>
                <span>{resposta.contratacoes_consultadas} contratações consultadas</span>
              </div>
              <p className="pncp-price-disclaimer">{resposta.mensagem}</p>
              {resposta.contratacoes_com_falha_de_consulta > 0 && (
                <p className="pncp-price-warning" role="status">
                  Não foi possível ler os itens de {resposta.contratacoes_com_falha_de_consulta} contratação(ões). A lista pode estar incompleta.
                </p>
              )}
              {resposta.resultados.length === 0 && <p>Nenhuma referência compatível foi encontrada com os filtros selecionados.</p>}
              <div className="pncp-price-results-list">
                {resposta.resultados.map((preco, indice) => (
                  <CartaoPreco
                    key={`${preco.numero_controle_pncp}-${preco.numero_item}-${preco.tipo_preco}-${indice}`}
                    preco={preco}
                    aoAplicar={() => aplicar(preco)}
                  />
                ))}
              </div>
            </div>
          )}
          <p className="pncp-price-footnote">
            Preço homologado e valor estimado são categorias distintas. Antes de usar uma referência, confira descrição, unidade, quantidade, localidade, data, condições de fornecimento e o documento original. A comparação automática considera somente semelhança textual da descrição; não certifica equivalência técnica.
          </p>
        </div>
      </details>
    </section>
  );
}
