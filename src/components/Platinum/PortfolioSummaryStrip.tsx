import React from 'react';

export default function PortfolioSummaryStrip() {
  return (
    <div className="terminal-card w-full flex items-center p-5 gap-12">
      <div className="flex flex-col">
        <span className="text-[11px] text-slate-400 font-medium mb-1">Portfolio Value</span>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-white tracking-tight">$248,310.55</span>
          <span className="text-xs font-medium text-[#05D588]">+$3,420.12 / +1.41%</span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-slate-400 font-medium mb-1">Available Cash</span>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-white tracking-tight">$15,670.00</span>
        </div>
      </div>
      <div className="flex flex-col ml-auto">
        <span className="text-[11px] text-slate-400 font-medium mb-1 text-right">Total Gain/Loss</span>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-[#05D588] tracking-tight">+$41,200.00</span>
          <span className="text-xs font-medium text-[#05D588]">+20.1%</span>
        </div>
      </div>
    </div>
  );
}
