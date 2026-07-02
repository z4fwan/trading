'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const commands: Command[] = useMemo(() => [
    { id: 'overview', label: 'Dashboard Overview', description: 'Main dashboard with AI analytics and market overview', shortcut: 'G D', action: () => router.push('/dashboard?view=overview') },
    { id: 'chart', label: 'Fullscreen Chart', description: 'Open interactive trading chart with indicators', shortcut: 'G C', action: () => router.push('/dashboard?view=chart') },
    { id: 'stocks', label: 'Stock Lists', description: 'Browse all tracked stocks and indices', shortcut: 'G S', action: () => router.push('/dashboard?view=stocks') },
    { id: 'predictions', label: 'AI Predictions', description: 'Weekly AI-powered market predictions', shortcut: 'G P', action: () => router.push('/dashboard?view=predictions') },
    { id: 'trust', label: 'AI Trust Engine', description: 'Model accuracy, backtest results, trust metrics', shortcut: 'G T', action: () => router.push('/dashboard?view=trust') },
    { id: 'prices', label: 'Live Prices', description: 'Real-time market prices and streaming data', shortcut: 'G L', action: () => router.push('/dashboard?view=prices') },
    { id: 'access', label: 'Access Control', description: 'Guest code management and user monitoring', shortcut: 'G A', action: () => router.push('/dashboard?view=access') },
  ], [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.shortcut?.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const execute = useCallback((cmd: Command) => {
    cmd.action();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && filtered[selectedIdx]) { execute(filtered[selectedIdx]); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, selectedIdx, execute, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-500 shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="M16 16l4 4" />
          </svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Search commands, views, tickers…"
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-600 focus:outline-none" />
          <kbd className="text-[8px] font-mono text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto custom-scrollbar py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[9px] font-mono text-slate-600">No results for &ldquo;{query}&rdquo;</div>
          )}
          {filtered.map((cmd, i) => (
            <button key={cmd.id} onClick={() => execute(cmd)}
              className={`w-full text-left flex items-center justify-between px-4 py-2.5 transition-colors ${i === selectedIdx ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : 'border-l-2 border-transparent hover:bg-slate-800/30'}`}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold font-mono text-white">{cmd.label}</div>
                <div className="text-[8px] font-mono text-slate-500 mt-0.5 line-clamp-1">{cmd.description}</div>
              </div>
              {cmd.shortcut && (
                <kbd className="text-[7px] font-mono text-slate-600 border border-slate-700 rounded px-1.5 py-0.5 ml-3 shrink-0">{cmd.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-800 text-[7px] font-mono text-slate-600">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  );
}
