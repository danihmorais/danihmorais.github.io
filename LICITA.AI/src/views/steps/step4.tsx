import React, { useState, useEffect } from "react";

export default function Step4({ dados, atualizarDados }: any) {
  const [gestorNome, setGestorNome] = useState("");
  const [gestorCargo, setGestorCargo] = useState("");
  const [fiscalNome, setFiscalNome] = useState("");
  const [fiscalCargo, setFiscalCargo] = useState("");

  const [gestoresSalvos, setGestoresSalvos] = useState<any[]>([]);
  const [fiscaisSalvos, setFiscaisSalvos] = useState<any[]>([]);

  const [modalGestorAberto, setModalGestorAberto] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);

  useEffect(() => {
    invoke("ler_dados_usuario").then((dadosSalvos: any) => {
      if (dadosSalvos) {
        if (dadosSalvos.gestores_salvos) setGestoresSalvos(dadosSalvos.gestores_salvos);
        if (dadosSalvos.fiscais_salvos) setFiscaisSalvos(dadosSalvos.fiscais_salvos);
      }
    }).catch(console.error);
  }, []);

  const salvarGestoresNoBackend = async (novosGestores: any[]) => {
    try {
      const dados_usuario: any = await invoke("ler_dados_usuario") || {};
      dados_usuario.gestores_salvos = novosGestores;
      await invoke("salvar_dados_usuario", { dados: dados_usuario });
    } catch (e) {
      console.error(e);
    }
  };

  const salvarFiscaisNoBackend = async (novosFiscais: any[]) => {
    try {
      const dados_usuario: any = await invoke("ler_dados_usuario") || {};
      dados_usuario.fiscais_salvos = novosFiscais;
      await invoke("salvar_dados_usuario", { dados: dados_usuario });
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
      alert("Este gestor já está salvo na sua lista.");
      return;
    }
    const novosSalvos = [...gestoresSalvos, gestor];
    setGestoresSalvos(novosSalvos);
    salvarGestoresNoBackend(novosSalvos);
    alert("Gestor salvo com sucesso!");
  };

  const handleSalvarFiscal = (fiscal: any) => {
    const jaExiste = fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo);
    if (jaExiste) {
      alert("Este fiscal já está salvo na sua lista.");
      return;
    }
    const novosSalvos = [...fiscaisSalvos, fiscal];
    setFiscaisSalvos(novosSalvos);
    salvarFiscaisNoBackend(novosSalvos);
    alert("Fiscal salvo com sucesso!");
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
    salvarGestoresNoBackend(novosSalvos);
  };

  const handleApagarFiscalSalvo = (index: number) => {
    const novosSalvos = fiscaisSalvos.filter((_, i) => i !== index);
    setFiscaisSalvos(novosSalvos);
    salvarFiscaisNoBackend(novosSalvos);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      
      <div>
        <h2 style={{ fontSize: "16px", margin: "0 0 8px 0", color: "var(--text-main)" }}>
          Gestores do Contrato <span style={{ color: "var(--btn-danger)" }}>*</span>
        </h2>
        <p style={{ color: "var(--text-muted)", margin: "0 0 16px 0", fontSize: "13px" }}>Adicione pelo menos um responsável pelo contrato.</p>
        
        <div style={{ background: "var(--bg-subtle)", border: dados.gestores.length === 0 ? "1px solid var(--btn-danger)" : "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "20px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Nome</label>
              <input 
                type="text" 
                value={gestorNome}
                onChange={(e) => setGestorNome(e.target.value)}
                style={{ padding: "10px" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Cargo</label>
              <input 
                type="text" 
                value={gestorCargo}
                onChange={(e) => setGestorCargo(e.target.value)}
                style={{ padding: "10px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button 
                onClick={handleAddGestor}
                disabled={!gestorNome || !gestorCargo}
                style={{ padding: "0 16px", height: "40px", background: (!gestorNome || !gestorCargo) ? "var(--text-light)" : "var(--btn-primary)", color: "var(--bg-panel)", border: "none", fontSize: "13px", cursor: (!gestorNome || !gestorCargo) ? "not-allowed" : "pointer" }}
              >
                Adicionar Gestor
              </button>
              <button 
                onClick={() => setModalGestorAberto(true)}
                style={{ padding: "0 12px", height: "40px", background: "var(--bg-panel)", color: "var(--text-main)", border: "1px solid var(--border)", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                Usar dados salvos ▼
              </button>
            </div>
          </div>

          <div style={{ background: "var(--bg-panel)", borderRadius: "var(--radius)", border: "1px solid var(--border)", minHeight: "80px", maxHeight: "150px", overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {dados.gestores.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-light)", fontSize: "13px" }}>Nenhum gestor adicionado.</div>
            )}
            {dados.gestores.map((gestor: any, index: number) => (
              <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: "500" }}>{gestor.nome} — {gestor.cargo}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button 
                      onClick={() => handleSalvarGestor(gestor)}
                      disabled={gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo)}
                      style={{ 
                        padding: "6px 12px", 
                        background: gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "var(--text-light)" : "var(--btn-success)", 
                        color: "var(--bg-panel)", 
                        border: "none", 
                        fontSize: "11px", 
                        cursor: gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "default" : "pointer" 
                      }}
                    >
                      {gestoresSalvos.some(g => g.nome === gestor.nome && g.cargo === gestor.cargo) ? "Já Salvo" : "Salvar Gestor"}
                    </button>
                  </div>
                  <button 
                    onClick={() => handleRemoveGestor(index)}
                    style={{ padding: "6px 12px", background: "var(--btn-danger)", color: "var(--bg-panel)", border: "none", fontSize: "11px" }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: "16px", margin: "0 0 8px 0", color: "var(--text-main)" }}>
          Fiscais do Contrato <span style={{ color: "var(--btn-danger)" }}>*</span>
        </h2>
        <p style={{ color: "var(--text-muted)", margin: "0 0 16px 0", fontSize: "13px" }}>Registre pelo menos um fiscal responsável pelo acompanhamento.</p>
        
        <div style={{ background: "var(--bg-subtle)", border: dados.fiscais.length === 0 ? "1px solid var(--btn-danger)" : "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "20px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Nome</label>
              <input 
                type="text" 
                value={fiscalNome}
                onChange={(e) => setFiscalNome(e.target.value)}
                style={{ padding: "10px" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Cargo</label>
              <input 
                type="text" 
                value={fiscalCargo}
                onChange={(e) => setFiscalCargo(e.target.value)}
                style={{ padding: "10px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button 
                onClick={handleAddFiscal}
                disabled={!fiscalNome || !fiscalCargo}
                style={{ padding: "0 16px", height: "40px", background: (!fiscalNome || !fiscalCargo) ? "var(--text-light)" : "var(--btn-primary)", color: "var(--bg-panel)", border: "none", fontSize: "13px", cursor: (!fiscalNome || !fiscalCargo) ? "not-allowed" : "pointer" }}
              >
                Adicionar Fiscal
              </button>
              <button 
                onClick={() => setModalFiscalAberto(true)}
                style={{ padding: "0 12px", height: "40px", background: "var(--bg-panel)", color: "var(--text-main)", border: "1px solid var(--border)", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                Usar dados salvos ▼
              </button>
            </div>
          </div>

          <div style={{ background: "var(--bg-panel)", borderRadius: "var(--radius)", border: "1px solid var(--border)", minHeight: "80px", maxHeight: "150px", overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {dados.fiscais.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-light)", fontSize: "13px" }}>Nenhum fiscal adicionado.</div>
            )}
            {dados.fiscais.map((fiscal: any, index: number) => (
              <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-subtle)", padding: "8px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: "500" }}>{fiscal.nome} — {fiscal.cargo}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button 
                      onClick={() => handleSalvarFiscal(fiscal)}
                      disabled={fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo)}
                      style={{ 
                        padding: "6px 12px", 
                        background: fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "var(--text-light)" : "var(--btn-success)", 
                        color: "var(--bg-panel)", 
                        border: "none", 
                        fontSize: "11px", 
                        cursor: fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "default" : "pointer" 
                      }}
                    >
                      {fiscaisSalvos.some(f => f.nome === fiscal.nome && f.cargo === fiscal.cargo) ? "Já Salvo" : "Salvar Fiscal"}
                    </button>
                  </div>
                  <button 
                    onClick={() => handleRemoveFiscal(index)}
                    style={{ padding: "6px 12px", background: "var(--btn-danger)", color: "var(--bg-panel)", border: "none", fontSize: "11px" }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalGestorAberto && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--bg-panel)", padding: "24px", borderRadius: "var(--radius-xl)", width: "100%", maxWidth: "450px", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "var(--text-main)", fontSize: "18px" }}>Gestores Salvos</h3>
              <button onClick={() => setModalGestorAberto(false)} style={{ background: "none", border: "none", fontSize: "20px", color: "var(--text-muted)" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
              {gestoresSalvos.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center" }}>Nenhum gestor salvo ainda.</p>
              ) : (
                gestoresSalvos.map((g, i) => {
                  const emUso = dados.gestores.some((dg: any) => dg.nome === g.nome && dg.cargo === g.cargo);

                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-subtle)" }}>
                      <div style={{ fontSize: "13px", color: "var(--text-main)" }}>
                        <div style={{ fontWeight: "600" }}>{g.nome}</div>
                        <div>{g.cargo}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button 
                          onClick={() => handleUsarGestorSalvo(g)} 
                          disabled={emUso}
                          style={{ padding: "6px 12px", background: emUso ? "var(--text-light)" : "var(--btn-primary)", color: "var(--bg-panel)", border: "none", fontSize: "12px", cursor: emUso ? "not-allowed" : "pointer" }}
                        >
                          {emUso ? "Em uso" : "Usar"}
                        </button>
                        <button onClick={() => handleApagarGestorSalvo(i)} style={{ padding: "6px 8px", background: "rgba(220,38,38,0.15)", color: "var(--btn-danger)", border: "none", fontSize: "12px" }}>Apagar</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button onClick={() => setModalGestorAberto(false)} style={{ padding: "8px 16px", background: "var(--bg-subtle)", color: "var(--text-main)", border: "none" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modalFiscalAberto && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--bg-panel)", padding: "24px", borderRadius: "var(--radius-xl)", width: "100%", maxWidth: "450px", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "var(--text-main)", fontSize: "18px" }}>Fiscais Salvos</h3>
              <button onClick={() => setModalFiscalAberto(false)} style={{ background: "none", border: "none", fontSize: "20px", color: "var(--text-muted)" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
              {fiscaisSalvos.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center" }}>Nenhum fiscal salvo ainda.</p>
              ) : (
                fiscaisSalvos.map((f, i) => {
                  const emUso = dados.fiscais.some((df: any) => df.nome === f.nome && df.cargo === f.cargo);

                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-subtle)" }}>
                      <div style={{ fontSize: "13px", color: "var(--text-main)" }}>
                        <div style={{ fontWeight: "600" }}>{f.nome}</div>
                        <div>{f.cargo}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button 
                          onClick={() => handleUsarFiscalSalvo(f)} 
                          disabled={emUso}
                          style={{ padding: "6px 12px", background: emUso ? "var(--text-light)" : "var(--btn-primary)", color: "var(--bg-panel)", border: "none", fontSize: "12px", cursor: emUso ? "not-allowed" : "pointer" }}
                        >
                          {emUso ? "Em uso" : "Usar"}
                        </button>
                        <button onClick={() => handleApagarFiscalSalvo(i)} style={{ padding: "6px 8px", background: "rgba(220,38,38,0.15)", color: "var(--btn-danger)", border: "none", fontSize: "12px" }}>Apagar</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button onClick={() => setModalFiscalAberto(false)} style={{ padding: "8px 16px", background: "var(--bg-subtle)", color: "var(--text-main)", border: "none" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}