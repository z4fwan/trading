'use client';
import React, { useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import SmoothPrice from '@/components/SmoothPrice';
import AccuracySnapshot from '@/components/AccuracySnapshot';
import EndOfDayReport from '@/components/EndOfDayReport';
import { getFeedStatusDisplay } from '@/lib/feedStatus';

export default function DashboardOverviewCards() {
  const { stocks, indices, connectionStatus, pricesStreaming, market } = useMarketData();

  const nseIndex = indices['^NSEI'];
  const sensexIndex = indices['^BSESN'];
  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);

  const sectorChanges = useMemo(() => {
    const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'];
    const bankStocks = ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'JPM'];
    const pharmaStocks = ['JNJ', 'UNH'];
    const energyStocks = ['RELIANCE', 'ONGC'];
    const autoStocks = ['MARUTI', 'TSLA'];
    const fmcgStocks = ['ITC', 'TITAN', 'WMT'];
    const avgChange = (tickers: string[]) => {
      const vals = tickers.map(t => stocks[t]?.changePercent).filter(Boolean) as number[];
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    return [
      { name: 'Technology', change: parseFloat(avgChange(techStocks).toFixed(1)), color: 'bg-blue-500' },
      { name: 'Banking', change: parseFloat(avgChange(bankStocks).toFixed(1)), color: 'bg-green-500' },
      { name: 'Pharma', change: parseFloat(avgChange(pharmaStocks).toFixed(1)), color: 'bg-red-400' },
      { name: 'FMCG', change: parseFloat(avgChange(fmcgStocks).toFixed(1)), color: 'bg-yellow-500' },
      { name: 'Auto', change: parseFloat(avgChange(autoStocks).toFixed(1)), color: 'bg-purple-500' },
      { name: 'Energy', change: parseFloat(avgChange(energyStocks).toFixed(1)), color: 'bg-orange-500' },
    ];
  }, [stocks]);

  const sentimentScore = useMemo(() => {
    const total = sectorChanges.reduce((s, sec) => s + sec.change, 0);
    return Math.min(100, Math.max(0, (total / sectorChanges.length) * 10 + 50));
  }, [sectorChanges]);

  const sentimentLabel = sentimentScore > 60 ? 'Bullish' : sentimentScore > 45 ? 'Neutral' : 'Bearish';
  const sentimentColor = sentimentLabel === 'Bullish' ? 'text-emerald-400' : sentimentLabel === 'Neutral' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {/* NIFTY 50 */}
      <div className="terminal-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <div className="text-sm text-slate-400 font-medium tracking-wide">NIFTY 50</div>
        </div>
        {nseIndex ? (
          <div className="flex items-end justify-between mt-3">
            <SmoothPrice value={nseIndex.price} decimals={1} className="text-2xl font-semibold text-slate-100 tracking-tight" />
            <div className={`text-sm font-medium ${nseIndex.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {nseIndex.change >= 0 ? '+' : ''}{nseIndex.changePercent.toFixed(2)}%
            </div>
          </div>
        ) : <span className="text-sm text-slate-500">---</span>}
      </div>

      {/* BSE SENSEX */}
      <div className="terminal-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <div className="text-sm text-slate-400 font-medium tracking-wide">BSE SENSEX</div>
        </div>
        {sensexIndex ? (
          <div className="flex items-end justify-between mt-3">
            <SmoothPrice value={sensexIndex.price} decimals={1} className="text-2xl font-semibold text-slate-100 tracking-tight" />
            <div className={`text-sm font-medium ${sensexIndex.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {sensexIndex.change >= 0 ? '+' : ''}{sensexIndex.changePercent.toFixed(2)}%
            </div>
          </div>
        ) : <span className="text-sm text-slate-500">---</span>}
      </div>

      {/* Sentiment */}
      <div className="terminal-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${sentimentLabel === 'Bullish' ? 'bg-emerald-400' : sentimentLabel === 'Neutral' ? 'bg-yellow-400' : 'bg-red-400'}`} />
          <div className="text-sm text-slate-400 font-medium tracking-wide">Sentiment</div>
        </div>
        <div className="flex items-end justify-between mt-3">
          <div className={`text-2xl font-semibold tracking-tight ${sentimentColor}`}>{Math.round(sentimentScore)}</div>
          <div className={`text-sm font-medium ${sentimentColor}`}>{sentimentLabel}</div>
        </div>
      </div>

      {/* Feed Status */}
      <div className="terminal-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${feed.dotClass.replace('box-shadow', '')}`} style={{ backgroundColor: feed.dotClass.includes('green') ? '#10b981' : '#ef4444' }} />
          <div className="text-sm text-slate-400 font-medium tracking-wide">Data Stream</div>
        </div>
        <div className="mt-4">
          <span className={`text-sm font-medium px-3 py-1 rounded-full bg-slate-700 ${feed.badgeClass.split(' ')[0]}`}>{feed.label}</span>
        </div>
      </div>
    </div>
  );
}
