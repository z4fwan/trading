import React, { useEffect, useState } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

interface Signal { strategy: string; ticker: string; pairTicker?: string; signal: string; confidence: number; expectedReturn: number; holdingPeriod: string; reasoning: string; entryPrice?: number; targetPrice?: number; stopLoss?: number; timestamp: number; }

export default function QuantStrategiesPanel() {
  const { engineState } = useMarketData();
  const [restSignals, setRestSignals] = useState<Signal[]>([]);
  const [restLoading, setRestLoading] = useState(true);

  // Under `npm run dev` the /ws engine stream doesn't exist (it's only wired in
  // server.js), so engineState stays null and the panel would spin forever.
  // Fall back to the REST scan endpoint until the stream arrives.
  useEffect(() => {
    if (engineState?.liveQuantSignals) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/quant-strategies');
        const data = await res.json();
        if (!cancelled && Array.isArray(data.signals)) setRestSignals(data.signals);
      } catch { /* keep panel empty rather than crash */ }
      finally { if (!cancelled) setRestLoading(false); }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [engineState]);

  const signals: Signal[] = engineState?.liveQuantSignals || restSignals;
  const loading = !engineState && restLoading;

  const strategyCounts = signals.reduce((acc, s) => { acc[s.strategy] = (acc[s.strategy] || 0) + 1; return acc; }, {} as Record<string, number>);
  const buySignals = signals.filter(s => s.signal === 'BUY').length;
  const sellSignals = signals.filter(s => s.signal === 'SELL').length;
  const avgConf = signals.length ? (signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length).toFixed(1) : '0.0';

  if (loading) return <div className="h-48 flex items-center justify-center font-mono text-slate-500 text-sm animate-pulse">Waiting for AI engine stream...</div>;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-900/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-900/10 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              QUANT ENGINE
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Live High-Frequency Algorithmic Signals</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">Avg Confidence</div>
              <div className="text-sm font-bold text-cyan-400 font-mono">{avgConf}%</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {Object.entries(strategyCounts).map(([strat, count]) => (
            <div key={strat} className="px-2.5 py-1 bg-slate-800/40 border border-slate-700/50 rounded flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-300">{strat.replace(/_/g, ' ')}</span>
              <span className="text-[9px] font-bold font-mono text-emerald-400">{count}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {signals.length === 0 && <div className="text-center text-slate-500 text-[11px] font-mono py-12 bg-slate-950/30 rounded-xl border border-slate-800/30">No active signals — market conditions neutral</div>}
          {signals.map((s, i) => (
            <div key={i} className={`relative overflow-hidden bg-slate-950/60 border rounded-xl p-4 transition-all hover:bg-slate-900/80 ${s.signal === 'BUY' ? 'border-emerald-900/30 hover:border-emerald-700/50' : 'border-red-900/30 hover:border-red-700/50'}`}>
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.signal === 'BUY' ? 'bg-gradient-to-b from-emerald-400 to-emerald-900' : 'bg-gradient-to-b from-red-400 to-red-900'}`} />
              
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`text-[11px] font-black tracking-widest px-2 py-1 rounded ${s.signal === 'BUY' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' : 'bg-red-950/80 text-red-400 border border-red-900/50'}`}>
                    {s.signal}
                  </div>
                  <div className="text-lg font-bold text-white tracking-tight">
                    {s.ticker} {s.pairTicker && <span className="text-slate-500 text-sm font-normal">/ {s.pairTicker}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] text-slate-500 font-mono mb-0.5">{s.strategy.replace(/_/g, ' ')}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${s.confidence}%` }} />
                    </div>
                    <span className="text-[10px] font-bold font-mono text-cyan-400">{s.confidence}%</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] leading-relaxed text-slate-400 mb-4 border-l-2 border-slate-800 pl-3 py-0.5">
                {s.reasoning}
              </div>

              <div className="grid grid-cols-4 gap-2 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
                <div>
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-0.5">Entry</div>
                  <div className="text-[11px] font-mono text-slate-300">{s.entryPrice ? `$${s.entryPrice.toFixed(2)}` : 'MKT'}</div>
                </div>
                <div>
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-0.5">Target</div>
                  <div className="text-[11px] font-mono text-emerald-400">{s.targetPrice ? `$${s.targetPrice.toFixed(2)}` : '—'}</div>
                </div>
                <div>
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-0.5">Stop Loss</div>
                  <div className="text-[11px] font-mono text-red-400">{s.stopLoss ? `$${s.stopLoss.toFixed(2)}` : '—'}</div>
                </div>
                <div>
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-0.5">Holding</div>
                  <div className="text-[11px] font-mono text-amber-400/80">{s.holdingPeriod}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
