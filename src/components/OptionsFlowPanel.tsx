import React from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

interface Activity { ticker: string; type: string; signal: string; confidence: number; description: string; timestamp: number; premium?: number; expiry?: string; strike?: number; }

export default function OptionsFlowPanel() {
  const { engineState } = useMarketData();
  const allActivities: Activity[] = engineState?.liveOptionsFlow || [];
  const loading = !engineState;

  const bullish = allActivities.filter(a => a.signal === 'BULLISH').length;
  const bearish = allActivities.filter(a => a.signal === 'BEARISH').length;
  const uniqueTickers = new Set(allActivities.map(a => a.ticker)).size;
  const totalPremium = allActivities.reduce((sum, a) => sum + (a.premium || 0), 0);
  const formattedPremium = totalPremium > 1000000 ? `$${(totalPremium / 1000000).toFixed(1)}M` : `$${(totalPremium / 1000).toFixed(0)}K`;

  if (loading) return <div className="h-48 flex items-center justify-center font-mono text-slate-500 text-sm animate-pulse">Waiting for AI engine stream...</div>;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-900/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              UNUSUAL OPTIONS FLOW
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Dark Pool & Institutional Sweeps</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">Total Premium</div>
              <div className="text-sm font-bold text-purple-400 font-mono">{formattedPremium}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Tickers</div>
            <div className="text-lg font-bold font-mono text-white">{uniqueTickers}</div>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Alerts</div>
            <div className="text-lg font-bold font-mono text-yellow-400">{allActivities.length}</div>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-900/10" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1 relative z-10">Bullish</div>
            <div className="text-lg font-bold font-mono text-emerald-400 relative z-10">{bullish}</div>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-red-900/10" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1 relative z-10">Bearish</div>
            <div className="text-lg font-bold font-mono text-red-400 relative z-10">{bearish}</div>
          </div>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {allActivities.length === 0 && <div className="text-center text-slate-500 text-[11px] font-mono py-12 bg-slate-950/30 rounded-xl border border-slate-800/30">No unusual activity detected</div>}
          {allActivities.map((a, i) => (
            <div key={i} className={`relative bg-slate-950/80 border rounded-xl p-4 transition-all hover:bg-slate-900 flex flex-col ${a.signal === 'BULLISH' ? 'border-emerald-900/30 hover:border-emerald-700/50' : 'border-red-900/30 hover:border-red-700/50'}`}>
              
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`text-lg font-black tracking-tight ${a.signal === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {a.ticker}
                  </div>
                  <div className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${a.type === 'CALL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-red-950 text-red-400 border border-red-900'}`}>
                    {a.type}
                  </div>
                  {a.premium && a.premium >= 1000000 && (
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-bold font-mono uppercase animate-pulse">Whale</span>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] text-slate-400 font-mono mb-0.5">Confidence</div>
                  <div className={`text-sm font-bold font-mono ${a.confidence > 90 ? 'text-purple-400' : 'text-cyan-400'}`}>{a.confidence}%</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/50 rounded-lg p-3 border border-slate-800/50 mb-3">
                {a.description}
              </div>

              <div className="flex items-center gap-4 text-[10px] font-mono">
                {a.strike && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Strike</span>
                    <span className="text-white font-bold">${a.strike}</span>
                  </div>
                )}
                {a.expiry && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Expiry</span>
                    <span className="text-white font-bold">{a.expiry}</span>
                  </div>
                )}
                {a.premium && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-slate-500">Premium</span>
                    <span className="text-amber-400 font-bold">${(a.premium / 1000).toFixed(0)}K</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
