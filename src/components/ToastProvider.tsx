'use client';
import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from 'react';
import { TerminalIcon } from '@/components/icons/TerminalIcons';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, detail?: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {}, dismiss: () => {} });

export const useToast = () => useContext(ToastContext);

const COLORS: Record<ToastType, { bg: string; border: string; icon: string; dot: string }> = {
  success: { bg: 'bg-emerald-950/90', border: 'border-emerald-700/50', icon: 'text-emerald-400', dot: 'bg-emerald-500' },
  error: { bg: 'bg-red-950/90', border: 'border-red-700/50', icon: 'text-red-400', dot: 'bg-red-500' },
  info: { bg: 'bg-blue-950/90', border: 'border-blue-700/50', icon: 'text-blue-400', dot: 'bg-blue-500' },
  warning: { bg: 'bg-amber-950/90', border: 'border-amber-700/50', icon: 'text-amber-400', dot: 'bg-amber-500' },
};

function ToastIcon({ type }: { type: ToastType }) {
  const cn = COLORS[type].icon;
  switch (type) {
    case 'success': return <TerminalIcon name="check" size={14} className={cn} />;
    case 'error': return <TerminalIcon name="x" size={14} className={cn} />;
    case 'warning': return <span className={`${cn} text-[10px]`}>⚠</span>;
    default: return <span className={`${cn} text-[10px]`}>ℹ</span>;
  }
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const c = COLORS[t.type];
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onDismiss]);

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl px-3 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-sm flex items-start gap-2.5 min-w-[260px] max-w-sm animate-slide-up`}
      role="alert">
      <div className={`w-1.5 h-1.5 rounded-full ${c.dot} mt-1.5 shrink-0 animate-pulse`} />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold font-mono text-white">{t.message}</div>
        {t.detail && <div className="text-[8px] font-mono text-slate-400 mt-0.5 line-clamp-2">{t.detail}</div>}
      </div>
      <button onClick={() => onDismiss(t.id)} className="text-slate-600 hover:text-white transition-colors p-0.5">
        <TerminalIcon name="x" size={10} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((type: ToastType, message: string, detail?: string, duration?: number) => {
    const id = `t${++idRef.current}`;
    setToasts(prev => [...prev, { id, type, message, detail, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem t={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
