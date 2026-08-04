'use client';
import React, { useState, useEffect, useCallback } from 'react';

interface Signal {
  id: string; ticker: string; name: string;
  direction: 'BULLISH' | 'BEARISH';
  confidence: number; entryPrice: number; targetPrice: number;
  stopLoss?: number; reasoning: string[];
  createdAt: number; source: string;
}

interface Stats { bullish: number; bearish: number; total: number; }

function SignalCard({ s }: { s: Signal }) {
  const potentialReturn = s.entryPrice > 0 ? Math.abs((s.targetPrice - s.entryPrice) / s.entryPrice) * 100 : 0;
  const riskAmount = s.stopLoss && s.entryPrice > 0 ? Math.abs((s.entryPrice - s.stopLoss) / s.entryPrice) * 100 : 0;
  const rr = riskAmount > 0 ? (potentialReturn / riskAmount) : 0;

  return (
    <div className={`terminal-card p-4 border-l-4 ${s.direction === 'BULLISH' ? 'border-l-emerald-500' : 'border-l-red-500'} hover:border-l-width-${s.direction === 'BULLISH' ? 'emerald' : 'red'}-400 transition-all`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold font-mono text-white">{s.ticker}</span>
              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${s.direction === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                {s.direction === 'BULLISH' ? '▲ BUY' : '▼ SELL'}
              </span>
            </div>
            {s.name && <span className="text-[9px] text-slate-500 font-mono mt-0.5">{s.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-700/50">{s.source}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-[7px] font-mono text-slate-600 uppercase">Entry</div>
          <div className="text-[10px] font-bold font-mono text-white mt-0.5">₹{s.entryPrice}</div>
        </div>
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-[7px] font-mono text-slate-600 uppercase">Target</div>
          <div className="text-[10px] font-bold font-mono text-blue-400 mt-0.5">₹{s.targetPrice}</div>
        </div>
        {s.stopLoss ? (
          <div className="bg-slate-950/60 rounded-lg p-2 text-center">
            <div className="text-[7px] font-mono text-slate-600 uppercase">Stop</div>
            <div className="text-[10px] font-bold font-mono text-red-400 mt-0.5">₹{s.stopLoss}</div>
          </div>
        ) : <div />}
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-[7px] font-mono text-slate-600 uppercase">R/R</div>
          <div className={`text-[10px] font-bold font-mono mt-0.5 ${rr >= 2 ? 'text-emerald-400' : rr >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
            {rr.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <div className="flex justify-between text-[8px] font-mono mb-1">
            <span className="text-slate-500">Confidence</span>
            <span className="text-white font-bold">{s.confidence}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className={`h-full rounded-full ${s.confidence >= 70 ? 'bg-emerald-500' : s.confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${s.confidence}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] font-mono text-slate-500">Return</div>
          <div className={`text-[11px] font-bold font-mono ${potentialReturn > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
            +{potentialReturn.toFixed(1)}%
          </div>
        </div>
      </div>

      {s.reasoning.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
          {s.reasoning.map((r, i) => (
            <span key={i} className="text-[7px] font-mono text-slate-400 bg-slate-800/50 px-1.5 py-0.5 rounded-full border border-slate-700/50">
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AISignalsFeed() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<Stats>({ bullish: 0, bearish: 0, total: 0 });

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-signals');
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals || []);
      setStats(data.stats || { bullish: 0, bearish: 0, total: 0 });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchSignals(); const t = setInterval(fetchSignals, 30000); return () => clearInterval(t); }, [fetchSignals]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AI Trading Signals
          </h2>
          <p className="text-[9px] text-slate-500 font-mono mt-1">Machine learning signals with confidence scoring & risk analysis</p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono">
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-emerald-400 font-bold">{stats.bullish}</span>
            <span className="text-slate-500">Bullish</span>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-red-400 font-bold">{stats.bearish}</span>
            <span className="text-slate-500">Bearish</span>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">{stats.total}</span>
            <span className="text-slate-500">Total</span>
          </div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="grid gap-3">
          {signals.map(s => <SignalCard key={s.id} s={s} />)}
        </div>
      )}
      {signals.length === 0 && (
        <div className="terminal-card p-10 text-center">
          <div className="text-xl mb-2">🧠</div>
          <div className="text-[10px] font-mono text-slate-500">No AI signals available</div>
          <div className="text-[8px] font-mono text-slate-600 mt-1">Signals appear automatically after AI analysis completes on new market data</div>
        </div>
      )}
    </div>
  );
}
