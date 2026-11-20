import React, { useEffect, useRef } from "react";

type Props = {
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
};

export default function AccessibleDialog({ labelledBy, onClose, className = "", children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const elementoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogo = dialogRef.current;
    const controles = () => dialogo
      ? [...dialogo.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])')]
          .filter(elemento => !elemento.hasAttribute("disabled") && elemento.getAttribute("aria-hidden") !== "true")
      : [];
    const focarPrimeiroControle = () => (controles()[0] || dialogo)?.focus();
    const tratarTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onCloseRef.current();
        return;
      }
      if (evento.key !== "Tab") return;
      const itens = controles();
      if (!itens.length) {
        evento.preventDefault();
        dialogo?.focus();
      } else if (evento.shiftKey && (document.activeElement === itens[0] || !dialogo?.contains(document.activeElement))) {
        evento.preventDefault();
        itens[itens.length - 1].focus();
      } else if (!evento.shiftKey && document.activeElement === itens[itens.length - 1]) {
        evento.preventDefault();
        itens[0].focus();
      }
    };
    const foco = window.setTimeout(focarPrimeiroControle, 0);
    document.addEventListener("keydown", tratarTecla);
    return () => {
      window.clearTimeout(foco);
      document.removeEventListener("keydown", tratarTecla);
      elementoAnterior?.focus();
    };
  }, []);

  return (
    <div className="accessible-dialog-overlay">
      <div ref={dialogRef} className={["accessible-dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
