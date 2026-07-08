import React from 'react';

export default function SignalCard({ item, onClick }: { item: any, onClick: (item: any) => void }) {
  // Extract probabilities and signals
  const prob = item.v5_intelligence?.forecasts?.prob_1day ? Math.round(item.v5_intelligence.forecasts.prob_1day * 100) : (item.ai_analysis?.ensemble_confidence || 0);
  const v5 = item.v5_intelligence || {};
  const decision = v5.decision_trace || {};
  
  // Real V5 Data
  const expectedReturn = v5.forecasts?.expected_return ? `+${(v5.forecasts.expected_return * 100).toFixed(1)}%` : (item.ai_analysis?.expected_movement_pct || '+0.0%');
  const winRate = v5.historical_win_rate ? `${(v5.historical_win_rate * 100).toFixed(1)}%` : 'N/A';
  const accumProb = v5.accumulation_prob ? `${(v5.accumulation_prob * 100).toFixed(1)}%` : 'N/A';
  const volumeSurge = item.context?.volume_surge_ratio || 'N/A';
  const currentPrice = item.context?.current_price || 'N/A';
  const confidence = decision.confidence_tier?.toUpperCase() || (prob > 85 ? 'HIGH' : prob > 60 ? 'MEDIUM' : 'LOW');
  
  // Actual AI Reasoning (Deep Learned Description)
  const aiReasoning = decision.reasoning || item.ai_analysis?.llm_reasoning || "Analyzing underlying catalysts and momentum factors...";

  return (
    <div 
      onClick={() => onClick(item)}
      className="bg-slate-900 border border-slate-700 rounded-lg p-5 cursor-pointer hover:border-blue-500/70 transition-all shadow-lg hover:shadow-blue-900/20 relative overflow-hidden group flex flex-col h-full"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-400 to-indigo-600 group-hover:w-1.5 transition-all"></div>
      
      {/* Header section */}
      <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-4">
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-white tracking-widest">{item.symbol}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-slate-800 text-slate-300 border border-slate-700">
                {v5.event_category?.replace('_', ' ') || item.ai_analysis?.event_type?.replace('_', ' ') || 'GENERAL'}
              </span>
            </div>
            
            {/* Real Price Display */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 font-mono tracking-widest">CMP</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">{currentPrice}</span>
            </div>
          </div>
          
          {/* THE HEADLINE - Crucial missing element */}
          <h3 className="text-sm font-medium text-slate-200 mt-1 leading-snug line-clamp-2 pr-4">
            {item.headline || "Corporate Announcement Logged"}
          </h3>
        </div>
      </div>

      {/* Main Prediction Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-xs text-blue-400 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            V5 Pre-Momentum Engine
          </span>
          <span className="text-sm font-bold text-white font-mono">{Math.min(100, Math.max(0, prob))}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
          <div 
            className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full relative" 
            style={{ width: `${Math.min(100, Math.max(0, prob))}%` }}
          >
            <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/30"></div>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 shadow-inner">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Exp Return</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">{expectedReturn}</div>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 shadow-inner">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Win Rate</div>
          <div className="text-sm font-bold text-amber-400 font-mono">{winRate}</div>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 shadow-inner">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Confidence</div>
          <div className="text-sm font-bold text-blue-400 font-mono">{confidence}</div>
        </div>
      </div>

      {/* Deep Learning Reasoning Panel */}
      <div className="flex-grow flex flex-col mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Deep Learn Analysis</span>
        </div>
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex-grow text-xs text-slate-300 leading-relaxed font-sans line-clamp-3 overflow-hidden shadow-inner relative">
          <span className="text-purple-500 mr-1.5 font-bold">»</span> 
          {aiReasoning}
          {/* Fade out text at the bottom if it gets too long */}
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-950/60 to-transparent"></div>
        </div>
      </div>

      {/* V5 Flow Metrics Footer */}
      <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Accumulation</div>
          <div className="text-xs font-bold text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{accumProb}</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Vol Surge</div>
          <div className="text-xs font-bold text-rose-400 font-mono bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">{volumeSurge}x</div>
        </div>
      </div>
    </div>
  );
}
