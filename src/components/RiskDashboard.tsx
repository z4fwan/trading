import React from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

interface RiskData {
  portfolioValue: number;
  valueAtRisk95: number;
  beta: number;
  maxDrawdown: number;
  sharpeRatio: number;
  stressTests: Array<{ scenario: string; impact: number; color: string }>;
}

export default function RiskDashboard() {
  const { engineState } = useMarketData();
  const data = engineState?.liveRiskData as RiskData | null;
  const loading = !engineState;

  if (loading) return <div className="h-48 flex items-center justify-center font-mono text-slate-500 text-sm animate-pulse">Computing portfolio risk...</div>;
  if (!data) return <div className="h-32 flex items-center justify-center font-mono text-slate-500 text-sm">Risk data unavailable</div>;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-900/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-900/10 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              RISK ANALYTICS
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Real-time Exposure & Stress Tests</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">Total Exposure</div>
              <div className="text-sm font-bold text-white font-mono">${(data.portfolioValue / 1000000).toFixed(2)}M</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-red-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">VaR (95%)</div>
            <div className="text-lg font-bold font-mono text-red-400">{(data.valueAtRisk95 * 100).toFixed(1)}%</div>
            <div className="text-[8px] text-slate-500 font-mono mt-1">Daily Max Loss</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-orange-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Beta</div>
            <div className={`text-lg font-bold font-mono ${data.beta > 1.2 ? 'text-orange-400' : 'text-emerald-400'}`}>{data.beta.toFixed(2)}</div>
            <div className="text-[8px] text-slate-500 font-mono mt-1">Market Correlation</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-yellow-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Max Drawdown</div>
            <div className="text-lg font-bold font-mono text-yellow-400">{(data.maxDrawdown * 100).toFixed(1)}%</div>
            <div className="text-[8px] text-slate-500 font-mono mt-1">Historical Peak-Trough</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-emerald-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Sharpe Ratio</div>
            <div className="text-lg font-bold font-mono text-emerald-400">{data.sharpeRatio.toFixed(2)}</div>
            <div className="text-[8px] text-slate-500 font-mono mt-1">Risk-Adjusted Return</div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Stress Test Scenarios
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.stressTests.map((test, i) => (
              <div key={i} className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-4 transition-all hover:border-slate-700/60 group relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${test.impact < -100000 ? 'bg-red-500' : 'bg-yellow-500'} opacity-50 group-hover:opacity-100 transition-opacity`} />
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono mb-2">{test.scenario}</div>
                <div className={`text-xl font-black font-mono tracking-tight ${test.color}`}>
                  {test.impact < 0 ? '-' : '+'}${Math.abs(test.impact).toLocaleString()}
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1 mt-3 overflow-hidden">
                  <div className={`h-full ${test.impact < -100000 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, Math.abs(test.impact) / 1500)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
