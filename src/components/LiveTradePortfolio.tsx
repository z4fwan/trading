'use client';
import React, { useState, useEffect } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

interface PaperTrade {
  id: string;
  ticker: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  pnl_percent: number | null;
  status: string;
  created_at: number;
  reasoning: string;
  confidence: number;
}

export default function LiveTradePortfolio() {
  const { engineState } = useMarketData();
  const trades: PaperTrade[] = engineState?.livePaperTrades?.map((t: any) => ({
    id: t.id,
    ticker: t.ticker,
    direction: t.direction,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    pnl_percent: t.netPnlPercent,
    status: t.result === 'PENDING' ? 'OPEN' : 'CLOSED',
    created_at: t.entryDate,
    reasoning: t.reason,
    confidence: t.accuracyPercent
  })) || [];
  
  const loading = !engineState;

  const closedTrades = trades.filter(t => t.status === 'CLOSED' || t.exit_price);
  const openTrades = trades.filter(t => t.status === 'OPEN' && !t.exit_price);
  const wins = closedTrades.filter(t => (t.pnl_percent && t.pnl_percent > 0));
  const winRate = closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-white font-mono">Live Portfolio</h2>
          <p className="text-[10px] text-slate-500 font-mono">Autonomous AI Paper Trading Execution Log</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded">
            <div className="text-[10px] text-slate-500 font-bold uppercase">Win Rate</div>
            <div className="text-xl font-bold text-emerald-400">{winRate}%</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded">
            <div className="text-[10px] text-slate-500 font-bold uppercase">Total Trades</div>
            <div className="text-xl font-bold text-white">{trades.length}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-slate-500 font-mono animate-pulse">Loading trade history...</div>
        ) : trades.length === 0 ? (
          <div className="text-sm text-slate-500 font-mono">No autonomous trades executed yet. The AI is waiting for high-probability setups.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-500 uppercase">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Ticker</th>
                  <th className="pb-2">Direction</th>
                  <th className="pb-2">Entry</th>
                  <th className="pb-2">Exit</th>
                  <th className="pb-2">PNL %</th>
                  <th className="pb-2">AI Reasoning</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {trades.map(trade => (
                  <tr key={trade.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 text-slate-400 whitespace-nowrap">{new Date(trade.created_at).toLocaleString()}</td>
                    <td className="py-3 font-bold text-white">{trade.ticker}</td>
                    <td className={`py-3 font-bold ${trade.direction === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>{trade.direction}</td>
                    <td className="py-3 text-slate-300">${trade.entry_price.toFixed(2)}</td>
                    <td className="py-3 text-slate-400">{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : 'ACTIVE'}</td>
                    <td className={`py-3 font-bold ${trade.pnl_percent && trade.pnl_percent > 0 ? 'text-emerald-400' : trade.pnl_percent && trade.pnl_percent < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {trade.pnl_percent !== null ? `${trade.pnl_percent > 0 ? '+' : ''}${trade.pnl_percent.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-3 text-slate-500 text-[10px] truncate max-w-xs" title={trade.reasoning}>{trade.reasoning || 'Automated execution'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
