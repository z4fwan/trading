'use client';
import React, { useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';

export default function SectorHeatmap() {
  const { stocks } = useMarketData();

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

  return (
    <div className="terminal-card p-5 flex flex-col h-full">
      <div className="text-sm font-medium text-slate-400 tracking-wide mb-4 border-b border-slate-700/50 pb-3">Sector Heatmap</div>
      <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
        {sectorChanges.map((sector, i) => (
          <div key={i} className="flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-3 py-2 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${sector.color}`} />
              <span className="text-sm font-medium text-slate-300 truncate">{sector.name}</span>
            </div>
            <div className={`text-sm font-semibold ${sector.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {sector.change >= 0 ? '+' : ''}{sector.change}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
