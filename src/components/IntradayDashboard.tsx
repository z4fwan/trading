'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { useToast } from './ToastProvider';

interface IntradayCall {
  id: string; ticker: string; name: string;
  direction: 'BULLISH' | 'BEARISH';
  confidence: number; entryPrice: number; currentPrice: number;
  targetPrice: number; stopLoss: number; quantity: number;
  predictedReturnPct: number; riskReward: number;
  reasoning: string[]; keyFactors: string[];
  createdAt: number; status: string;
}

interface IntradayPlan {
  totalCalls: number; suggestedTrades: number; maxTrades: number;
  capitalPerTrade: number; maxLossPerTrade: number; maxLossPerDay: number;
  riskPerTradePercent: number; positionSizingMethod: string;
}

export default function IntradayDashboard() {
  const { engineState } = useMarketData();
  const [storeCalls, setStoreCalls] = useState<IntradayCall[]>([]);
  const { toast } = useToast();

  // Fallback: read the persisted intraday store (/api/intraday) when the
  // WebSocket engine state is not populated yet (e.g. right after restart).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/intraday', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data?.calls) setStoreCalls(data.calls);
      } catch { /* non-fatal */ }
    };
    void load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const liveCalls: IntradayCall[] = engineState?.liveIntradayCalls || [];
  const calls: IntradayCall[] = liveCalls.length > 0 ? liveCalls : storeCalls;
  const plan: IntradayPlan | null = engineState?.liveIntradayPlan || null;

  const generating = false;
  const resolving = false;
  const live = true;

  const generateCalls = async () => {
    toast('info', 'Scanning Market...', 'Triggering AI to scan for new intraday setups.');
    try {
      await fetch('/api/force');
      toast('success', 'Scan Complete', 'Intraday signals will populate momentarily via WebSocket.');
    } catch (e) {
      toast('error', 'Scan Failed', 'Could not trigger the backend scan.');
    }
  };

  const resolveCalls = async () => {
    toast('info', 'Managed by AI', 'P&L tracking is now fully autonomous and updates automatically.');
  };

  const activeCalls = calls.filter(c => c.status === 'ACTIVE');
  const totalPnl = calls.reduce((sum, c) => {
    const pnl = ((c.currentPrice - c.entryPrice) / c.entryPrice) * 100 * (c.direction === 'BULLISH' ? 1 : -1);
    return sum + pnl;
  }, 0);
  const avgPnl = calls.length > 0 ? totalPnl / calls.length : 0;
  const wins = calls.filter(c => {
    const pnl = ((c.currentPrice - c.entryPrice) / c.entryPrice) * 100 * (c.direction === 'BULLISH' ? 1 : -1);
    return pnl > 0;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Intraday Signals
          </h2>
          <p className="text-[9px] text-slate-500 font-mono mt-1">
            Scans Indian and Global stocks for movement, runs AI analysis, and flags trade setups with live P&L tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generateCalls} disabled={generating}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-mono rounded-lg transition-all shadow-lg shadow-emerald-900/20">
            {generating ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Scanning...</span> : 'Scan Stocks'}
          </button>
          <button onClick={resolveCalls} disabled={resolving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-mono rounded-lg transition-all shadow-lg shadow-blue-900/20">
            {resolving ? 'Refreshing...' : 'Refresh Prices'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {calls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="terminal-card p-2.5 text-center">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Setups</div>
            <div className="text-xs font-bold font-mono text-white mt-0.5">{calls.length}</div>
          </div>
          <div className="terminal-card p-2.5 text-center">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Active</div>
            <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">{activeCalls.length}</div>
          </div>
          <div className="terminal-card p-2.5 text-center">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Wins/Losses</div>
            <div className="text-xs font-bold font-mono text-white mt-0.5">{wins}/{calls.length - wins}</div>
          </div>
          <div className="terminal-card p-2.5 text-center">
            <div className="text-[7px] font-mono text-slate-500 uppercase">Avg P&L</div>
            <div className={`text-xs font-bold font-mono mt-0.5 ${avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Plan summary */}
      {plan && (
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[7px] font-mono text-slate-500 uppercase">Per trade</div>
            <div className="text-[11px] font-bold font-mono text-white mt-0.5">₹{plan.capitalPerTrade}</div>
          </div>
          <div>
            <div className="text-[7px] font-mono text-slate-500 uppercase">Max trades</div>
            <div className="text-[11px] font-bold font-mono text-white mt-0.5">{plan.maxTrades}</div>
          </div>
          <div>
            <div className="text-[7px] font-mono text-slate-500 uppercase">Risk per trade</div>
            <div className="text-[11px] font-bold font-mono text-amber-400 mt-0.5">{plan.riskPerTradePercent}%</div>
          </div>
          <div>
            <div className="text-[7px] font-mono text-slate-500 uppercase">Max loss / day</div>
            <div className="text-[11px] font-bold font-mono text-red-400 mt-0.5">₹{plan.maxLossPerDay}</div>
          </div>
        </div>
      )}

      {/* Signal cards */}
      <div className="grid gap-2.5">
        {calls.map(call => {
          const pnl = ((call.currentPrice - call.entryPrice) / call.entryPrice) * 100 * (call.direction === 'BULLISH' ? 1 : -1);
          const hitTarget = call.direction === 'BULLISH' ? call.currentPrice >= call.targetPrice : call.currentPrice <= call.targetPrice;
          const stoppedOut = call.direction === 'BULLISH' ? call.currentPrice <= call.stopLoss : call.currentPrice >= call.stopLoss;
          return (
            <div key={call.id} className={`terminal-card p-3 border-l-4 ${call.direction === 'BULLISH' ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
              {/* Row 1: Ticker + direction + status badges */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-white">{call.ticker}</span>
                  <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${call.direction === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {call.direction === 'BULLISH' ? 'BUY' : 'SELL'}
                  </span>
                  {call.name && <span className="text-[8px] text-slate-500 font-mono hidden sm:inline">{call.name}</span>}
                  {hitTarget && <span className="text-[8px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">TARGET HIT</span>}
                  {stoppedOut && <span className="text-[8px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">STOPPED</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${call.confidence >= 70 ? 'bg-emerald-500/15 text-emerald-400' : call.confidence >= 40 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
                    {call.confidence}% confidence
                  </span>
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${pnl >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Row 2: Price levels */}
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div className="bg-slate-950/60 rounded p-1.5 text-center">
                  <div className="text-[6px] font-mono text-slate-600 uppercase">Entry</div>
                  <div className="text-[9px] font-bold font-mono text-white">{call.entryPrice}</div>
                </div>
                <div className="bg-slate-950/60 rounded p-1.5 text-center">
                  <div className="text-[6px] font-mono text-slate-600 uppercase">Current</div>
                  <div className={`text-[9px] font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{call.currentPrice}</div>
                </div>
                <div className="bg-slate-950/60 rounded p-1.5 text-center">
                  <div className="text-[6px] font-mono text-slate-600 uppercase">Target</div>
                  <div className="text-[9px] font-bold font-mono text-blue-400">{call.targetPrice}</div>
                </div>
                <div className="bg-slate-950/60 rounded p-1.5 text-center">
                  <div className="text-[6px] font-mono text-slate-600 uppercase">Stop</div>
                  <div className="text-[9px] font-bold font-mono text-red-400">{call.stopLoss}</div>
                </div>
              </div>

              {/* Row 3: Confidence bar + quantity + R:R */}
              <div className="flex items-center gap-3 text-[8px] font-mono text-slate-500 mb-1.5">
                <div className="flex-1">
                  <div className="bg-slate-800 rounded-full h-1">
                    <div className={`h-full rounded-full ${call.confidence >= 70 ? 'bg-emerald-500' : call.confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${call.confidence}%` }} />
                  </div>
                </div>
                <span>{call.quantity} shares</span>
                <span>R:R {call.riskReward.toFixed(1)}</span>
                <span>{call.predictedReturnPct >= 0 ? '+' : ''}{call.predictedReturnPct.toFixed(1)}% expected</span>
              </div>

              {/* Row 4: AI reasoning — single line */}
              {call.reasoning.length > 0 && (
                <div className="text-[7px] font-mono text-slate-400 bg-slate-800/30 rounded px-2 py-1 leading-relaxed">
                  {call.reasoning.join('. ')}.
                </div>
              )}
            </div>
          );
        })}
        {calls.length === 0 && !generating && (
          <div className="terminal-card p-10 text-center">
            <div className="text-2xl mb-2">🔍</div>
            <div className="text-[10px] font-mono text-slate-500">No signals yet</div>
            <div className="text-[8px] font-mono text-slate-600 mt-1 max-w-sm mx-auto">
              Click &quot;Scan Stocks&quot; to scan NSE stocks for movement, run AI analysis, and find trade setups.
              Active signals update prices automatically every 10 seconds.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
