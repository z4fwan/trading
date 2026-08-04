import React from 'react';

export default function HoldingsPanel() {
  const data = [
    { symbol: 'NVDA', pos: '890.12', avg: '20.30', current: '$890.32', val: '$890.12', pnl: '+0.7%' },
    { symbol: 'AAPL', pos: '175.50', avg: '15.50', current: '$75.50', val: '$175.50', pnl: '+0.5%' },
    { symbol: 'AMZN', pos: '180.30', avg: '70.50', current: '$80.30', val: '$180.30', pnl: '+8.2%' },
  ];

  return (
    <div className="terminal-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">Holdings</h3>
        <button className="text-slate-500 hover:text-slate-300">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Position</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Avg Cost</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Current Price</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">Value</th>
              <th className="pb-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right">G/L%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                <td className="py-2.5 text-xs font-semibold text-slate-200">{row.symbol}</td>
                <td className="py-2.5 text-xs font-medium text-slate-300 text-right">{row.pos}</td>
                <td className="py-2.5 text-xs font-medium text-slate-400 text-right">{row.avg}</td>
                <td className="py-2.5 text-xs font-medium text-slate-300 text-right">{row.current}</td>
                <td className="py-2.5 text-xs font-medium text-slate-300 text-right">{row.val}</td>
                <td className="py-2.5 text-xs font-medium text-[#05D588] text-right">{row.pnl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
