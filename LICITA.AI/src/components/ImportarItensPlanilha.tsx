import { useState } from "react";
import { importarItensPlanilha, type ItemPlanilhaImportado } from "../api";

type Props = {
  onImport: (items: ItemPlanilhaImportado[]) => void;
};

export default function ImportarItensPlanilha({ onImport }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const importar = async (arquivo?: File) => {
    if (!arquivo) return;
    setCarregando(true);
    setErro("");
    setSucesso("");
    try {
      const resultado = await importarItensPlanilha(arquivo);
      onImport(resultado.items);
      setSucesso(`${resultado.count} itens importados de ${resultado.filename}.`);
    } catch (falha: any) {
      setErro(falha?.message || "Não foi possível importar a planilha.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <section className="planilha-import-panel" aria-label="Importar itens por planilha">
      <label htmlFor="licita-ai-importar-itens" className="planilha-import-label">Importar itens por CSV ou XLSX</label>
      <div className="planilha-import-controls">
        <input
          id="licita-ai-importar-itens"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={carregando}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            void importar(arquivo);
            evento.target.value = "";
          }}
          aria-describedby="licita-ai-importar-itens-ajuda"
        />
        <span id="licita-ai-importar-itens-ajuda" className="field-hint">Máximo de 5 MB e 1.000 itens. Colunas aceitas: número, descrição, unidade, quantidade e valor unitário.</span>
      </div>
      {carregando && <p role="status">Lendo planilha...</p>}
      {sucesso && <p className="planilha-import-success" role="status">{sucesso}</p>}
      {erro && <p className="field-error" role="alert">{erro}</p>}
    </section>
  );
}
