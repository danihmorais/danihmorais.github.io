import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastCard({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  useEffect(() => {
    const timeout = window.setTimeout(dismiss, toast.type === "error" ? 7000 : 4200);
    return () => window.clearTimeout(timeout);
  }, [dismiss, toast.type]);

  const icon = toast.type === "success" ? "✓" : toast.type === "info" ? "i" : "!";

  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
      <span className="toast-icon" aria-hidden="true">{icon}</span>
      <div className="toast-message">{toast.message}</div>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dispensar notificação"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const normalizedMessage = String(message ?? "").trim();
    if (!normalizedMessage) return;

    const toast = { id: ++nextId.current, message: normalizedMessage, type };
    setToasts(current => [...current.slice(-3), toast]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-viewport">
        {toasts.map(toast => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }
  return context;
}
