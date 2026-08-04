import React from 'react';

export default function QuickTradePanel() {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Quick Trade Box */}
      <div className="terminal-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">Quick Trade</h3>
          <button className="text-slate-500 hover:text-slate-300">•••</button>
        </div>
        
        <div className="flex bg-[#1B222C] rounded-lg p-1 mb-6">
          <button className="flex-1 py-1.5 text-xs font-semibold bg-[#232D3B] text-[#05D588] rounded-md shadow-sm">BUY</button>
          <button className="flex-1 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-md">SELL</button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between border-b border-slate-700/50 pb-2">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Symbol</span>
            <span className="text-[13px] font-semibold text-white">NVDA</span>
          </div>
          <div className="flex justify-between border-b border-slate-700/50 pb-2">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Price</span>
            <span className="text-[13px] font-semibold text-white">$890.12</span>
          </div>
          <div className="flex justify-between border-b border-slate-700/50 pb-2">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Qty</span>
            <span className="text-[13px] font-semibold text-white">50</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Total</span>
            <span className="text-[13px] font-semibold text-white">$44,506.00</span>
          </div>
        </div>

        <button className="w-full py-2.5 bg-[#05D588] hover:bg-[#04b070] text-[#1B222C] text-[13px] font-bold rounded-lg transition-colors">
          PLACE BUY ORDER
        </button>
      </div>

      {/* Recent Activity Box */}
      <div className="terminal-card p-5 flex-1 min-h-0 overflow-hidden flex flex-col">
        <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase mb-4 shrink-0">Recent Activity</h3>
        <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
          
          <div className="flex gap-3 items-center">
            <div className="w-6 h-6 rounded-full bg-[#05D588]/20 flex items-center justify-center text-[#05D588] shrink-0 text-xs font-bold">NV</div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white">NVDA</span>
              <span className="text-[10px] text-slate-400 truncate">Bought 50 shares @ $890.12</span>
            </div>
          </div>
          
          <div className="flex gap-3 items-center">
            <div className="w-6 h-6 rounded-full bg-[#E05C5C]/20 flex items-center justify-center text-[#E05C5C] shrink-0 text-xs font-bold">TS</div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white">TSLA</span>
              <span className="text-[10px] text-slate-400 truncate">Sold 100 shares @ $890.35</span>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 text-xs font-bold">!</div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white">Alert Triggered</span>
              <span className="text-[10px] text-slate-400 truncate">AAPL price below $175.00</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
