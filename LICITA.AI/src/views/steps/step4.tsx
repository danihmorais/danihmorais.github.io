import React, { useState, useEffect } from "react";
import { useToast } from "../../components/toast";
import AccessibleDialog from "../../components/AccessibleDialog";
import { lerDadosUsuario, salvarDadosUsuario } from "../../utils/storageLocal";

export default function Step4({

 dados, atualizarDados }: any) {


  const { showToast } = useToast();
  const [gestorNome, setGestorNome] = useState("");
  const [gestorCargo, setGestorCargo] = useState("");
  const [fiscalNome, setFiscalNome] = useState("");
  const [fiscalCargo, setFiscalCargo] = useState("");

  const [gestoresSalvos, setGestoresSalvos] = useState<any[]>([]);
  const [fiscaisSalvos, setFiscaisSalvos] = useState<any[]>([]);

  const [modalGestorAberto, setModalGestorAberto] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);

  useEffect(() => {
    const dadosSalvos = lerDadosUsuario();
    if (dadosSalvos) {
      if (dadosSalvos.gestores_salvos) setGestoresSalvos(dadosSalvos.gestores_salvos);
      if (dadosSalvos.fiscais_salvos) setFiscaisSalvos(dadosSalvos.fiscais_salvos);
    }
  }, []);

  const salvarGestoresLocal = (novosGestores: any[]) => {
    try {
      const dados_usuario = lerDadosUsuario() || {};
      dados_usuario.gestores_salvos = novosGestores;
      salvarDadosUsuario(dados_usuario);
    } catch (e) {
      console.error(e);
    }
  };

  const salvarFiscaisLocal = (novosFiscais: any[]) => {
    try {
      const dados_usuario = lerDadosUsuario() || {};
      dados_usuario.fiscais_salvos = novosFiscais;
      salvarDadosUsuario(dados_usuario);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddGestor = () => {
    if (!gestorNome || !gestorCargo) return;
    const novo = { nome: gestorNome, cargo: gestorCargo };
    atualizarDados({ gestores: [...dados.gestores, novo] });
    setGestorNome("");
    setGestorCargo("");
  };

  const handleAddFiscal = () => {
    if (!fiscalNome || !fiscalCargo) return;
    const novo = { nome: fiscalNome, cargo: fiscalCargo };
    atualizarDados({ fiscais: [...dados.fiscais, novo] });
    setFiscalNome("");
    setFiscalCargo("");
  };

  const handleRemoveGestor = (index: number) => {
    atualizarDados({ gestores: dados.gestores.filter((_: any, i: number) => i !== index) });
  };

  const handleRemoveFiscal = (index: number) => {
    atualizarDados({ fiscais: dados.fiscais.filter((_: any, i: number) => i !== index) });
  };

  const handleSalvarGestor = (gestor: any) => {
    const jaExiste = gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo);
    if (jaExiste) {
      showToast("Este gestor já está salvo na sua lista.", "warning");
      return;
    }
    const novosSalvos = [...gestoresSalvos, gestor];
    setGestoresSalvos(novosSalvos);
    salvarGestoresLocal(novosSalvos);
    showToast("Gestor salvo com sucesso!", "success");
  };

  const handleSalvarFiscal = (fiscal: any) => {
    const jaExiste = fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo);
    if (jaExiste) {
      showToast("Este fiscal já está salvo na sua lista.", "warning");
      return;
    }
    const novosSalvos = [...fiscaisSalvos, fiscal];
    setFiscaisSalvos(novosSalvos);
    salvarFiscaisLocal(novosSalvos);
    showToast("Fiscal salvo com sucesso!", "success");
  };

  const handleUsarGestorSalvo = (gestor: any) => {
    atualizarDados({ gestores: [...dados.gestores, gestor] });
    setModalGestorAberto(false);
  };

  const handleUsarFiscalSalvo = (fiscal: any) => {
    atualizarDados({ fiscais: [...dados.fiscais, fiscal] });
    setModalFiscalAberto(false);
  };

  const handleApagarGestorSalvo = (index: number) => {
    const novosSalvos = gestoresSalvos.filter((_, i) => i !== index);
    setGestoresSalvos(novosSalvos);
    salvarGestoresLocal(novosSalvos);
  };

  const handleApagarFiscalSalvo = (index: number) => {
    const novosSalvos = fiscaisSalvos.filter((_, i) => i !== index);
    setFiscaisSalvos(novosSalvos);
    salvarFiscaisLocal(novosSalvos);
  };

  return (
    <div className="step-form step-form--people licita-step4-style-001" >
      
      <div className="person-group person-group--managers">
        <h2  className={ ["licita-step4-style-002"].filter(Boolean).join(" ") }>
          Gestores do Contrato <span  className={ ["licita-step4-style-003"].filter(Boolean).join(" ") }>*</span>
        </h2>
        <p  className={ ["licita-step4-style-004"].filter(Boolean).join(" ") }>Adicione pelo menos um responsável pelo contrato.</p>
        
        <div className="person-section licita-step4-style-005" >
          <div className="person-entry-form licita-step4-style-006" >
            <div  className={ ["licita-step4-style-007"].filter(Boolean).join(" ") }>
              <label htmlFor="step4-gestor-nome"  className={ ["licita-step4-style-008"].filter(Boolean).join(" ") }>Nome</label>
              <input
                id="step4-gestor-nome"
                type="text"
                value={gestorNome}
                onChange={(e) => setGestorNome(e.target.value)}
                
               className={ ["licita-step4-style-009"].filter(Boolean).join(" ") }/>
            </div>
            <div  className={ ["licita-step4-style-010"].filter(Boolean).join(" ") }>
              <label htmlFor="step4-gestor-cargo"  className={ ["licita-step4-style-011"].filter(Boolean).join(" ") }>Cargo</label>
              <input
                id="step4-gestor-cargo"
                type="text"
                value={gestorCargo}
                onChange={(e) => setGestorCargo(e.target.value)}
                
               className={ ["licita-step4-style-012"].filter(Boolean).join(" ") }/>
            </div>
            <div  className={ ["licita-step4-style-013"].filter(Boolean).join(" ") }>
              <button type="button" 
                onClick={handleAddGestor}
                disabled={!gestorNome || !gestorCargo}
                
               className={ ["licita-step4-style-014", ((!gestorNome || !gestorCargo) ? "licita-step4-style-014-p3-a" : "licita-step4-style-014-p3-b"), ((!gestorNome || !gestorCargo) ? "licita-step4-style-014-p7-a" : "licita-step4-style-014-p7-b")].filter(Boolean).join(" ") }>
                Adicionar Gestor
              </button>
              <button type="button" 
                onClick={() => setModalGestorAberto(true)}
                
               className={ ["licita-step4-style-015"].filter(Boolean).join(" ") }>
                Usar dados salvos ▼
              </button>
            </div>
          </div>

          <div className="people-list licita-step4-style-016" >
            {dados.gestores.length === 0 && (
              <div  className={ ["licita-step4-style-017"].filter(Boolean).join(" ") }>Nenhum gestor adicionado.</div>
            )}
            {dados.gestores.map((gestor: any, index: number) => (
              <div key={gestor.id ?? `${gestor.nome}-${gestor.cargo}-${index}`} className="person-row licita-step4-style-018" >
                <span  className={ ["licita-step4-style-019"].filter(Boolean).join(" ") }>{gestor.nome} — {gestor.cargo}</span>
                <div  className={ ["licita-step4-style-020"].filter(Boolean).join(" ") }>
                  <div  className={ ["licita-step4-style-021"].filter(Boolean).join(" ") }>
                    <button type="button" 
                      onClick={() => handleSalvarGestor(gestor)}
                      disabled={gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo)}
                      
                     className={ ["licita-step4-style-022", (gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "licita-step4-style-022-p2-a" : "licita-step4-style-022-p2-b"), (gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "licita-step4-style-022-p6-a" : "licita-step4-style-022-p6-b")].filter(Boolean).join(" ") }>
                      {gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "Já Salvo" : "Salvar Gestor"}
                    </button>
                  </div>
                  <button type="button" 
                    onClick={() => handleRemoveGestor(index)}
                    
                   className={ ["licita-step4-style-023"].filter(Boolean).join(" ") }>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="person-group person-group--inspectors">
        <h2  className={ ["licita-step4-style-024"].filter(Boolean).join(" ") }>
          Fiscais do Contrato <span  className={ ["licita-step4-style-025"].filter(Boolean).join(" ") }>*</span>
        </h2>
        <p  className={ ["licita-step4-style-026"].filter(Boolean).join(" ") }>Registre pelo menos um fiscal responsável pelo acompanhamento.</p>
        
        <div className="person-section licita-step4-style-027" >
          <div className="person-entry-form licita-step4-style-028" >
            <div  className={ ["licita-step4-style-029"].filter(Boolean).join(" ") }>
              <label htmlFor="step4-fiscal-nome"  className={ ["licita-step4-style-030"].filter(Boolean).join(" ") }>Nome</label>
              <input
                id="step4-fiscal-nome"
                type="text"
                value={fiscalNome}
                onChange={(e) => setFiscalNome(e.target.value)}
                
               className={ ["licita-step4-style-031"].filter(Boolean).join(" ") }/>
            </div>
            <div  className={ ["licita-step4-style-032"].filter(Boolean).join(" ") }>
              <label htmlFor="step4-fiscal-cargo"  className={ ["licita-step4-style-033"].filter(Boolean).join(" ") }>Cargo</label>
              <input
                id="step4-fiscal-cargo"
                type="text"
                value={fiscalCargo}
                onChange={(e) => setFiscalCargo(e.target.value)}
                
               className={ ["licita-step4-style-034"].filter(Boolean).join(" ") }/>
            </div>
            <div  className={ ["licita-step4-style-035"].filter(Boolean).join(" ") }>
              <button type="button" 
                onClick={handleAddFiscal}
                disabled={!fiscalNome || !fiscalCargo}
                
               className={ ["licita-step4-style-036", ((!fiscalNome || !fiscalCargo) ? "licita-step4-style-036-p3-a" : "licita-step4-style-036-p3-b"), ((!fiscalNome || !fiscalCargo) ? "licita-step4-style-036-p7-a" : "licita-step4-style-036-p7-b")].filter(Boolean).join(" ") }>
                Adicionar Fiscal
              </button>
              <button type="button" 
                onClick={() => setModalFiscalAberto(true)}
                
               className={ ["licita-step4-style-037"].filter(Boolean).join(" ") }>
                Usar dados salvos ▼
              </button>
            </div>
          </div>

          <div className="people-list licita-step4-style-038" >
            {dados.fiscais.length === 0 && (
              <div  className={ ["licita-step4-style-039"].filter(Boolean).join(" ") }>Nenhum fiscal adicionado.</div>
            )}
            {dados.fiscais.map((fiscal: any, index: number) => (
              <div key={fiscal.id ?? `${fiscal.nome}-${fiscal.cargo}-${index}`} className="person-row licita-step4-style-040" >
                <span  className={ ["licita-step4-style-041"].filter(Boolean).join(" ") }>{fiscal.nome} — {fiscal.cargo}</span>
                <div  className={ ["licita-step4-style-042"].filter(Boolean).join(" ") }>
                  <div  className={ ["licita-step4-style-043"].filter(Boolean).join(" ") }>
                    <button type="button" 
                      onClick={() => handleSalvarFiscal(fiscal)}
                      disabled={fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo)}
                      
                     className={ ["licita-step4-style-044", (fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "licita-step4-style-044-p2-a" : "licita-step4-style-044-p2-b"), (fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "licita-step4-style-044-p6-a" : "licita-step4-style-044-p6-b")].filter(Boolean).join(" ") }>
                      {fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "Já Salvo" : "Salvar Fiscal"}
                    </button>
                  </div>
                  <button type="button" 
                    onClick={() => handleRemoveFiscal(index)}
                    
                   className={ ["licita-step4-style-045"].filter(Boolean).join(" ") }>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalGestorAberto && (
        <AccessibleDialog className="step-modal" labelledBy="step4-gestores-salvos-title" onClose={() => setModalGestorAberto(false)}>
            <div  className={ ["licita-step4-style-046"].filter(Boolean).join(" ") }>
              <h3 id="step4-gestores-salvos-title"  className={ ["licita-step4-style-047"].filter(Boolean).join(" ") }>Gestores Salvos</h3>
              <button type="button" onClick={() => setModalGestorAberto(false)}  className={ ["licita-step4-style-048"].filter(Boolean).join(" ") }>×</button>
            </div>
            <div  className={ ["licita-step4-style-049"].filter(Boolean).join(" ") }>
              {gestoresSalvos.length === 0 ? (
                <p  className={ ["licita-step4-style-050"].filter(Boolean).join(" ") }>Nenhum gestor salvo ainda.</p>
              ) : (
                gestoresSalvos.map((g, i) => {
                  const emUso = dados.gestores.some((dg: any) => dg.nome === g.nome && dg.cargo === g.cargo);

                  return (
                    <div key={i}  className={ ["licita-step4-style-051"].filter(Boolean).join(" ") }>
                      <div  className={ ["licita-step4-style-052"].filter(Boolean).join(" ") }>
                        <div  className={ ["licita-step4-style-053"].filter(Boolean).join(" ") }>{g.nome}</div>
                        <div>{g.cargo}</div>
                      </div>
                      <div  className={ ["licita-step4-style-054"].filter(Boolean).join(" ") }>
                        <button type="button" 
                          onClick={() => handleUsarGestorSalvo(g)} 
                          disabled={emUso}
                          
                         className={ ["licita-step4-style-055", (emUso ? "licita-step4-style-055-p2-a" : "licita-step4-style-055-p2-b"), (emUso ? "licita-step4-style-055-p6-a" : "licita-step4-style-055-p6-b")].filter(Boolean).join(" ") }>
                          {emUso ? "Em uso" : "Usar"}
                        </button>
                        <button type="button" onClick={() => handleApagarGestorSalvo(i)}  className={ ["licita-step4-style-056"].filter(Boolean).join(" ") }>Apagar</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div  className={ ["licita-step4-style-057"].filter(Boolean).join(" ") }>
              <button type="button" onClick={() => setModalGestorAberto(false)}  className={ ["licita-step4-style-058"].filter(Boolean).join(" ") }>Fechar</button>
            </div>
          </AccessibleDialog>
      )}

      {modalFiscalAberto && (
        <AccessibleDialog className="step-modal" labelledBy="step4-fiscais-salvos-title" onClose={() => setModalFiscalAberto(false)}>
            <div  className={ ["licita-step4-style-059"].filter(Boolean).join(" ") }>
              <h3 id="step4-fiscais-salvos-title"  className={ ["licita-step4-style-060"].filter(Boolean).join(" ") }>Fiscais Salvos</h3>
              <button type="button" onClick={() => setModalFiscalAberto(false)}  className={ ["licita-step4-style-061"].filter(Boolean).join(" ") }>×</button>
            </div>
            <div  className={ ["licita-step4-style-062"].filter(Boolean).join(" ") }>
              {fiscaisSalvos.length === 0 ? (
                <p  className={ ["licita-step4-style-063"].filter(Boolean).join(" ") }>Nenhum fiscal salvo ainda.</p>
              ) : (
                fiscaisSalvos.map((f, i) => {
                  const emUso = dados.fiscais.some((df: any) => df.nome === f.nome && df.cargo === f.cargo);

                  return (
                    <div key={i}  className={ ["licita-step4-style-064"].filter(Boolean).join(" ") }>
                      <div  className={ ["licita-step4-style-065"].filter(Boolean).join(" ") }>
                        <div  className={ ["licita-step4-style-066"].filter(Boolean).join(" ") }>{f.nome}</div>
                        <div>{f.cargo}</div>
                      </div>
                      <div  className={ ["licita-step4-style-067"].filter(Boolean).join(" ") }>
                        <button type="button" 
                          onClick={() => handleUsarFiscalSalvo(f)} 
                          disabled={emUso}
                          
                         className={ ["licita-step4-style-068", (emUso ? "licita-step4-style-068-p2-a" : "licita-step4-style-068-p2-b"), (emUso ? "licita-step4-style-068-p6-a" : "licita-step4-style-068-p6-b")].filter(Boolean).join(" ") }>
                          {emUso ? "Em uso" : "Usar"}
                        </button>
                        <button type="button" onClick={() => handleApagarFiscalSalvo(i)}  className={ ["licita-step4-style-069"].filter(Boolean).join(" ") }>Apagar</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div  className={ ["licita-step4-style-070"].filter(Boolean).join(" ") }>
              <button type="button" onClick={() => setModalFiscalAberto(false)}  className={ ["licita-step4-style-071"].filter(Boolean).join(" ") }>Fechar</button>
            </div>
          </AccessibleDialog>
      )}
    </div>
  );
}