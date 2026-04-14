"use client";

import React, { useState, useCallback, useEffect } from "react";
import { ToastContext, Toast, ToastType } from "../../hooks/useToast";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="shrink-0" />,
  error:   <XCircle    size={16} className="shrink-0" />,
  warning: <AlertTriangle size={16} className="shrink-0" />,
  info:    <Info       size={16} className="shrink-0" />,
};

const STYLES: Record<ToastType, string> = {
  success: "border-neon-green/40 bg-neon-green/10 text-neon-green",
  error:   "border-red-500/40   bg-red-500/10   text-red-400",
  warning: "border-neon-orange/40 bg-neon-orange/10 text-neon-orange",
  info:    "border-neon-cyan/40  bg-neon-cyan/10  text-neon-cyan",
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl text-sm font-medium font-mono animate-[slice-in_0.25s_ease-out] ${STYLES[t.type]}`}
    >
      {ICONS[t.type]}
      <span className="flex-1">{t.message}</span>
      <button
        onClick={() => onDismiss(t.id)}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
