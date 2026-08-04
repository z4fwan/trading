import React from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

export default function BacktestPanel() {
  const { engineState } = useMarketData();
  const strategies = engineState?.liveBacktestData?.strategies || {};
  const loading = !engineState;

  const entries = Object.entries(strategies as Record<string, { winRate: number; totalTrades: number; avgReturn: number; sharpe: number; bestTicker: string, maxDrawdown?: number, profitFactor?: number }>);
  const bestStrat = entries.length > 0 ? entries.sort((a, b) => (b[1].winRate || 0) - (a[1].winRate || 0))[0] : null;

  if (loading) return <div className="h-48 flex items-center justify-center font-mono text-slate-500 text-sm animate-pulse">Running backtests...</div>;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-64 h-64 bg-amber-900/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-rose-900/10 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              ALGO BACKTESTING
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Historical Strategy Performance</p>
          </div>
          {bestStrat && (
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">Top Win Rate</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">{(bestStrat[1].winRate * 100).toFixed(1)}%</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Strategies</div>
            <div className="text-lg font-bold font-mono text-white">{entries.length}</div>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-900/10" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1 relative z-10">Best Sharpe</div>
            <div className="text-lg font-bold font-mono text-emerald-400 relative z-10">{bestStrat ? bestStrat[1].sharpe.toFixed(2) : '—'}</div>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center col-span-2">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Top Strategy</div>
            <div className="text-lg font-bold font-mono text-cyan-400 truncate w-full text-center">{bestStrat ? bestStrat[0].replace(/_/g, ' ') : '—'}</div>
          </div>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {entries.length === 0 && <div className="text-center text-slate-500 text-[11px] font-mono py-12 bg-slate-950/30 rounded-xl border border-slate-800/30">No backtest data available yet</div>}
          {entries.sort((a, b) => (b[1].winRate || 0) - (a[1].winRate || 0)).map(([strat, data]) => (
            <div key={strat} className="relative bg-slate-950/80 border border-slate-800/60 rounded-xl p-4 transition-all hover:bg-slate-900 group">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-rose-600 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-3">
                <div className="text-sm font-black text-white tracking-wide">{strat.replace(/_/g, ' ')}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{data.totalTrades} Trades</span>
                  {data.bestTicker && (
                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-900/50">Top: {data.bestTicker}</span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-1">Win Rate</div>
                  <div className="flex items-end gap-1.5">
                    <div className={`text-lg font-black font-mono leading-none ${(data.winRate * 100) > 55 ? 'text-emerald-400' : (data.winRate * 100) > 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.winRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div className={`h-full ${(data.winRate * 100) > 55 ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${data.winRate * 100}%` }} />
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-1">Avg Return</div>
                  <div className={`text-lg font-black font-mono leading-none ${data.avgReturn > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.avgReturn > 0 ? '+' : ''}{(data.avgReturn * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-1">Sharpe Ratio</div>
                  <div className={`text-lg font-black font-mono leading-none ${data.sharpe > 1.5 ? 'text-emerald-400' : data.sharpe > 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {data.sharpe.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
                  <div className="text-[8px] text-slate-500 font-mono uppercase mb-1">Max Drawdown</div>
                  <div className="text-lg font-black font-mono leading-none text-rose-400">
                    {data.maxDrawdown ? `-${(data.maxDrawdown * 100).toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
