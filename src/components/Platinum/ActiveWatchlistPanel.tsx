import React, { useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDIAN_EQUITY_TICKERS, INDEX_TICKERS } from '@/lib/marketConfig';
import SmoothPrice from '@/components/SmoothPrice';

export default function ActiveWatchlistPanel() {
  const { stocks, indices } = useMarketData();

  const data = useMemo(() => {
    // Select a few top active tickers to show
    const topTickers = ['RELIANCE', 'TCS', 'HDFCBANK', 'AAPL', 'MSFT', 'NVDA'];
    const rows = [];

    for (const ticker of topTickers) {
      const q = stocks[ticker] || indices[ticker];
      if (q) {
        rows.push({
          ticker: INDEX_TICKERS[ticker] || ticker,
          price: q.price,
          change: q.changePercent || 0,
          vol: (q.volume / 1000000).toFixed(1) + 'M',
          color: (q.changePercent || 0) >= 0 ? 'text-[#05D588]' : 'text-red-400',
        });
      }
    }
    return rows;
  }, [stocks, indices]);

  return (
    <div className="terminal-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">Active Watchlist</h3>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider">Ticker</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Price</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Change%</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-xs text-slate-500">Waiting for live data...</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                  <td className="py-2.5 text-xs font-semibold text-slate-200">{row.ticker}</td>
                  <td className="py-2.5 text-xs font-medium text-slate-300 text-right">
                    <SmoothPrice value={row.price} decimals={2} />
                  </td>
                  <td className={`py-2.5 text-xs font-medium text-right ${row.color}`}>
                    {row.change > 0 ? '+' : ''}{row.change.toFixed(2)}%
                  </td>
                  <td className="py-2.5 text-xs font-medium text-slate-400 text-right">{row.vol}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
