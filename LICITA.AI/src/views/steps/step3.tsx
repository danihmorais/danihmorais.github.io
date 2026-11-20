NaN 
              type="checkbox" 
              checked={secretarias.includes(sec)} 
              onChange={() => handleToggleSecretaria(sec)} 
              
             className={ ["licita-step3-style-008"].filter(Boolean).join(" ") } />
            {sec}
          </label>
        ))}
      </div>

      {secretarias.length > 0 && (
        <div className="department-contacts-section">
          <h2  className={ ["licita-step3-style-009"].filter(Boolean).join(" ") } >Dados de Contato por Secretaria</h2>
          <div  className={ ["licita-step3-style-010"].filter(Boolean).join(" ") } >
            {secretarias.map((sec: string) => {
              const contatos = contatosSecretarias[sec] || [];
              const faltaContato = contatos.length === 0;

              return (
                <div key={sec} className={ ["department-contact-card licita-step3-style-011", (faltaContato ? "licita-step3-style-011-p2-a" : "licita-step3-style-011-p2-b")].filter(Boolean).join(" ") } >
                  <div className={ ["department-contact-form licita-step3-style-012"].filter(Boolean).join(" ") } >
                    <strong  className={ ["licita-step3-style-013"].filter(Boolean).join(" ") } >{sec}</strong>
                    <input 
                      type="email" 
                      placeholder="E-mail" 
                      value={emailsTemp[sec] || ""}
                      onChange={(e) => setEmailsTemp({ ...emailsTemp, [sec]: e.target.value })}
                       
                     className={ ["licita-step3-style-014"].filter(Boolean).join(" ") } />
                    <input 
                      type="text" 
                      placeholder="Telefone" 
                      value={telsTemp[sec] || ""}
                      onChange={(e) => setTelsTemp({ ...telsTemp, [sec]: e.target.value })}
                       
                     className={ ["licita-step3-style-015"].filter(Boolean).join(" ") } />
                    <div  className={ ["licita-step3-style-016"].filter(Boolean).join(" ") } >
                      <button 
                        onClick={() => handleAddContato(sec)}
                        disabled={!emailsTemp[sec] && !telsTemp[sec]}
                        
                       className={ ["licita-step3-style-017", ((!emailsTemp[sec] && !telsTemp[sec]) ? "licita-step3-style-017-p2-a" : "licita-step3-style-017-p2-b"), ((!emailsTemp[sec] && !telsTemp[sec]) ? "licita-step3-style-017-p5-a" : "licita-step3-style-017-p5-b")].filter(Boolean).join(" ") } >
                        + Adicionar
                      </button>
                      <button 
                        onClick={() => setModalSecAberto(sec)}
                        
                       className={ ["licita-step3-style-018"].filter(Boolean).join(" ") } >
                        Usar dados salvos ▼
                      </button>
                    </div>
                  </div>

                  <div className={ ["department-contact-list licita-step3-style-019"].filter(Boolean).join(" ") } >
                    {faltaContato && (
                      <div  className={ ["licita-step3-style-020"].filter(Boolean).join(" ") } >
                        Obrigatório adicionar pelo menos um contato
                      </div>
                    )}
                    {contatos.map((contato: any, idx: number) => (
                      <div key={idx} className={ ["department-contact-row licita-step3-style-021"].filter(Boolean).join(" ") } >
                        <span  className={ ["licita-step3-style-022"].filter(Boolean).join(" ") } >{contato.email || "—"} | {contato.tel || "—"}</span>
                        <div  className={ ["licita-step3-style-023"].filter(Boolean).join(" ") } >
                          <div  className={ ["licita-step3-style-024"].filter(Boolean).join(" ") } >
                            <button 
                              onClick={() => handleSalvarContatoIndiv(contato)}
                              disabled={contatosSalvos.some(s => s.email === contato.email && s.tel === contato.tel)}
                              
                             className={ ["licita-step3-style-025", (contatosSalvos.some(s => s.email === contato.email && s.tel === contato.tel) ? "licita-step3-style-025-p2-a" : "licita-step3-style-025-p2-b"), (contatosSalvos.some(s => s.email === contato.email && s.tel === contato.tel) ? "licita-step3-style-025-p6-a" : "licita-step3-style-025-p6-b")].filter(Boolean).join(" ") } >
                              {contatosSalvos.some(s => s.email === contato.email && s.tel === contato.tel) ? "Já Salvo" : "Salvar Contato"}
                            </button>
                          </div>
                          <button 
                            onClick={() => handleRemoveContato(sec, idx)}
                            
                           className={ ["licita-step3-style-026"].filter(Boolean).join(" ") } >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalSecAberto && (
        <AccessibleDialog className="step-modal" labelledBy="step3-contatos-salvos-title" onClose={() => setModalSecAberto(null)}>
            <div  className={ ["licita-step3-style-027"].filter(Boolean).join(" ") } >
              <h3 id="step3-contatos-salvos-title"  className={ ["licita-step3-style-028"].filter(Boolean).join(" ") } >Contatos Salvos</h3>
              <button type="button" aria-label="Fechar contatos salvos" onClick={() => setModalSecAberto(null)}  className={ ["licita-step3-style-029"].filter(Boolean).join(" ") } >×</button>
            </div>
            
            <div  className={ ["licita-step3-style-030"].filter(Boolean).join(" ") } >
              {contatosSalvos.length === 0 ? (
                <p  className={ ["licita-step3-style-031"].filter(Boolean).join(" ") } >Nenhum contato salvo ainda.</p>
              ) : (
                contatosSalvos.map((contato, i) => {
                  const contatosAtuais = contatosSecretarias[modalSecAberto] || [];
                  const emUso = contatosAtuais.some((c: any) => c.email === contato.email && c.tel === contato.tel);

                  return (
                    <div key={i}  className={ ["licita-step3-style-032"].filter(Boolean).join(" ") } >
                      <div  className={ ["licita-step3-style-033"].filter(Boolean).join(" ") } >
                        <div  className={ ["licita-step3-style-034"].filter(Boolean).join(" ") } >{contato.email || "Sem E-mail"}</div>
                        <div>{contato.tel || "Sem Telefone"}</div>
                      </div>
                      <div  className={ ["licita-step3-style-035"].filter(Boolean).join(" ") } >
                        <button 
                          onClick={() => handleUsarContatoSalvo(modalSecAberto, contato)} 
                          disabled={emUso}
                          
                         className={ ["licita-step3-style-036", (emUso ? "licita-step3-style-036-p2-a" : "licita-step3-style-036-p2-b"), (emUso ? "licita-step3-style-036-p6-a" : "licita-step3-style-036-p6-b")].filter(Boolean).join(" ") } >
                          {emUso ? "Em uso" : "Usar"}
                        </button>
                        <button onClick={() => handleRemoverContatoSalvo(i)}  className={ ["licita-step3-style-037"].filter(Boolean).join(" ") } >Apagar</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div  className={ ["licita-step3-style-038"].filter(Boolean).join(" ") } >
              <button type="button" onClick={() => setModalSecAberto(null)}  className={ ["licita-step3-style-039"].filter(Boolean).join(" ") } >Fechar</button>
            </div>
          </AccessibleDialog>
      )}
    </div>
  );
}