'use client';

import React from 'react';

type Props = {
  html: string;
  onNew: () => void;
};

export default function StockPulseReportView({ html, onNew }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/50 shadow-[0_0_40px_rgba(249,115,22,0.15)] bg-slate-950/80 backdrop-blur-xl relative">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-purple-500/5 pointer-events-none" />
      <div className="bg-slate-900/90 px-5 py-4 flex items-center justify-between border-b border-slate-700/50 relative z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl animate-pulse-glow">🧠</span>
          <div>
            <div className="text-[11px] text-slate-300 font-mono uppercase tracking-widest font-extrabold flex items-center gap-2">
              DeepSeek Neural Pulse
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
            <div className="text-[8px] text-orange-400/80 font-mono uppercase tracking-widest mt-0.5">Automated Fundamental Analysis</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="text-[10px] font-bold text-orange-300 hover:text-white bg-orange-950/40 hover:bg-orange-600/80 px-4 py-2 rounded-lg border border-orange-700/50 transition-all shadow-[0_0_15px_rgba(234,88,12,0.2)] hover:shadow-[0_0_20px_rgba(234,88,12,0.6)]"
        >
          ← New Research
        </button>
      </div>
      <iframe
        title="Stock Pulse fundamental report"
        srcDoc={html}
        className="w-full border-0 bg-transparent relative z-10 custom-scrollbar"
        style={{ minHeight: 'min(85vh, 900px)', height: '75vh' }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
