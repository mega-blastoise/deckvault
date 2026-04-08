import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import './Toast.css';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

interface ToastEntry {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ entry }: { entry: ToastEntry }) {
  return (
    <div className={`toast toast--${entry.kind}`} role="status" aria-live="polite">
      {entry.message}
    </div>
  );
}

function ToastContainer({ toasts }: { toasts: ToastEntry[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} entry={t} />
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = `toast_${Date.now()}_${++counterRef.current}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
