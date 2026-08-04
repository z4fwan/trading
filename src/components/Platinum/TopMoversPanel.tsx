import React from 'react';

export default function TopMoversPanel() {
  return (
    <div className="terminal-card p-5 h-full flex flex-col">
      <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase mb-1">Top Movers</h3>
      <span className="text-[10px] text-slate-500 mb-4 block">Gainers/Losers</span>
      
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-[#05D588]">Gainers</span>
          <span className="text-xs font-semibold text-[#05D588]">+1.45%</span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-slate-700/30">
          <span className="text-xs font-medium text-[#05D588]">Gainers</span>
          <span className="text-xs font-semibold text-[#05D588]">+1.32%</span>
        </div>
        
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs font-medium text-[#E05C5C]">Losers</span>
          <span className="text-xs font-semibold text-[#E05C5C]">-0.58%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-[#E05C5C]">Losers</span>
          <span className="text-xs font-semibold text-[#E05C5C]">-0.38%</span>
        </div>
      </div>
    </div>
  );
}
