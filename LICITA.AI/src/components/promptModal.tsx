import React, { useEffect, useRef, useState } from "react";
import { confirmarCodigoVerificacaoEmail, solicitarCodigoVerificacaoEmail, type DocumentosReferenciaUpload } from "../api";

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dados: { instrucoes: string; email: string; emailVerificationToken: string; arquivos: DocumentosReferenciaUpload }) => void;
  texto: string;
  onTextoChange: (valor: string) => void;
  email: string;
  onEmailChange: (valor: string) => void;
  arquivos: DocumentosReferenciaUpload;
  onArquivosChange: (arquivos: DocumentosReferenciaUpload) => void;
}

export default function PromptModal({
  isOpen, onClose, onConfirm, texto, onTextoChange, email, onEmailChange, arquivos, onArquivosChange,
}: PromptModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputArquivoRefs = useRef<Partial<Record<keyof DocumentosReferenciaUpload, HTMLInputElement | null>>>({});
  const onCloseRef = useRef(onClose);
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [verificacaoToken, setVerificacaoToken] = useState("");
  const [emailVerificado, setEmailVerificado] = useState("");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [confirmandoCodigo, setConfirmandoCodigo] = useState(false);
  const [erroVerificacao, setErroVerificacao] = useState("");
  const [mensagemVerificacao, setMensagemVerificacao] = useState("");
  onCloseRef.current = onClose;
  const emailVerificadoAtual = Boolean(verificacaoToken) && emailVerificado === email.trim().toLowerCase();
  const emailValido = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim());

  useEffect(() => {
    if (!isOpen) return;
    const anterior = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onCloseRef.current();
        return;
      }
      if (evento.key !== "Tab" || !dialogRef.current) return;
      const elementos = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!elementos.length) return;
      const primeiro = elementos[0];
      const ultimo = elementos[elementos.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      anterior?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const definirArquivo = (campo: keyof DocumentosReferenciaUpload, arquivo: File | null) => {
    onArquivosChange({ ...arquivos, [campo]: arquivo });
  };

  const removerArquivo = (campo: keyof DocumentosReferenciaUpload) => {
    const input = inputArquivoRefs.current[campo];
    if (input) input.value = "";
    definirArquivo(campo, null);
  };

  const handleEnviarCodigo = async () => {
    if (!emailValido || enviandoCodigo) return;
    setEnviandoCodigo(true);
    setErroVerificacao("");
    setMensagemVerificacao("");
    try {
      const resultado = await solicitarCodigoVerificacaoEmail(email.trim());
      setCodigoEnviado(true);
      setCodigo("");
      setVerificacaoToken("");
      setEmailVerificado("");
      setMensagemVerificacao(resultado.message);
    } catch (erro: any) {
      setErroVerificacao(erro?.message || "Não foi possível enviar o código.");
    } finally {
      setEnviandoCodigo(false);
    }
  };

  const handleConfirmarCodigo = async () => {
    if (!emailValido || !/^\d{6}$/.test(codigo) || confirmandoCodigo) return;
    setConfirmandoCodigo(true);
    setErroVerificacao("");
    setMensagemVerificacao("");
    try {
      const resultado = await confirmarCodigoVerificacaoEmail(email.trim(), codigo);
      setVerificacaoToken(resultado.token);
      setEmailVerificado(email.trim().toLowerCase());
      setMensagemVerificacao(resultado.message);
    } catch (erro: any) {
      setErroVerificacao(erro?.message || "Não foi possível confirmar o endereço.");
    } finally {
      setConfirmandoCodigo(false);
    }
  };

  const handleEmailChange = (valor: string) => {
    setCodigoEnviado(false);
    setCodigo("");
    setVerificacaoToken("");
    setEmailVerificado("");
    setErroVerificacao("");
    setMensagemVerificacao("");
    onEmailChange(valor);
  };

  const handleConfirmar = () => {
    if (!emailValido || !emailVerificadoAtual) return;
    onConfirm({ instrucoes: texto.trim(), email: email.trim(), emailVerificationToken: verificacaoToken, arquivos });
  };

  const campos: Array<{ chave: keyof DocumentosReferenciaUpload; titulo: string; descricao: string }> = [
    { chave: "dfd", titulo: "DFD anterior", descricao: "Use o DFD de processo anterior como referência principal." },
    { chave: "etp", titulo: "ETP anterior", descricao: "Use o ETP de processo anterior como referência principal." },
    { chave: "tr", titulo: "TR anterior", descricao: "Use o TR de processo anterior como referência principal." },
    { chave: "edital", titulo: "Edital / Aviso de Dispensa", descricao: "O backend recorta automaticamente apenas os anexos DFD, ETP e TR." },
  ];

  return (
    <div className="prompt-overlay" role="presentation">
      <div ref={dialogRef} className="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title" aria-describedby="prompt-modal-description">
        <div className="prompt-heading">
          <div className="prompt-heading-copy">
            <span className="prompt-eyebrow">ÚLTIMA ETAPA · ENVIO</span>
            <h2 id="prompt-modal-title">Confeccionar documentos</h2>
          </div>
          <button type="button" className="prompt-close" onClick={onClose} aria-label="Fechar janela">×</button>
        </div>
        <p className="prompt-lead" id="prompt-modal-description">
          Confira o e-mail de recebimento e, se necessário, anexe documentos de um processo anterior. Os arquivos são usados como referência para a elaboração dos novos documentos.
        </p>

        <div className="prompt-section">
          <span className="prompt-section-label">Documentos de referência <span className="optional-label">OPCIONAL</span></span>
          <div className="reference-grid">
            {campos.map((campo, index) => {
              const arquivo = arquivos[campo.chave];
              return (
                <div key={campo.chave} className={"reference-card" + (arquivo ? " has-file" : "")}>
                  <span className="reference-card-title">
                    <span className="reference-card-icon">{String(index + 1).padStart(2, "0")}</span>
                    {campo.titulo}
                  </span>
                  <span className="reference-card-description">{campo.descricao}</span>
                  <input
                    ref={(elemento) => { inputArquivoRefs.current[campo.chave] = elemento; }}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    aria-label={"Anexar " + campo.titulo}
                    onChange={(e) => definirArquivo(campo.chave, e.target.files?.[0] || null)}
                  />
                  {arquivo && (
                    <div className="reference-file-row">
                      <span className="reference-file-name">✓ {arquivo.name}</span>
                      <button
                        type="button"
                        className="reference-file-remove"
                        onClick={() => removerArquivo(campo.chave)}
                        aria-label={"Remover " + campo.titulo}
                      >Remover</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="reference-footnote">
            Formatos aceitos: PDF, DOCX e TXT. Documentos digitalizados podem passar por OCR quando não houver texto extraível. Ao anexar um Edital/Aviso, apenas os anexos DFD, ETP e TR encontrados serão encaminhados como contexto.
          </p>
        </div>

        <label className="prompt-field">
          E-mail para recebimento <span className="required-mark">*</span>
          <input
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailValido) handleConfirmar();
            }}
            placeholder="nome@instituicao.gov.br"
            autoFocus
            autoComplete="email"
            required
          />
          <span className="field-hint">O arquivo ZIP final será enviado para este endereço. A confirmação comprova que você tem acesso à caixa de entrada.</span>
        </label>

        <div className="email-verification-panel">
          {!emailVerificadoAtual ? (
            <>
              <button type="button" className="button button-secondary" onClick={handleEnviarCodigo} disabled={!emailValido || enviandoCodigo}>
                {enviandoCodigo ? "Enviando código..." : codigoEnviado ? "Enviar novo código" : "Enviar código de confirmação"}
              </button>
              {codigoEnviado && (
                <div className="email-verification-code">
                  <label className="prompt-field">
                    Código de 6 dígitos
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                    />
                  </label>
                  <button type="button" className="button button-secondary" onClick={handleConfirmarCodigo} disabled={codigo.length !== 6 || confirmandoCodigo}>
                    {confirmandoCodigo ? "Confirmando..." : "Confirmar e-mail"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="email-verification-success" role="status">✓ Endereço confirmado para esta solicitação.</span>
          )}
          {mensagemVerificacao && <span className="field-hint" role="status">{mensagemVerificacao}</span>}
          {erroVerificacao && <span className="field-error" role="alert">{erroVerificacao}</span>}
        </div>

        <label className="prompt-field">
          Instruções adicionais para a IA <span className="optional-label">OPCIONAL</span>
          <textarea
            value={texto}
            onChange={(e) => onTextoChange(e.target.value)}
            placeholder="Indique regras específicas, pontos de atenção ou referências importantes para esta contratação..."
          />
          <span className="field-hint">As instruções serão consideradas junto com os dados informados nas cinco etapas.</span>
        </label>

        <div className="prompt-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="button button-primary" onClick={handleConfirmar} disabled={!emailValido || !emailVerificadoAtual}>
            Colocar na fila <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
