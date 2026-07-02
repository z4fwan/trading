'use client';

import React, { useMemo } from 'react';

interface SentimentHeatmapProps {
  sentimentByTicker: Record<string, number>;
}

export function SentimentHeatmap({ sentimentByTicker }: SentimentHeatmapProps) {
  const mapData = useMemo(() => {
    // Convert object to array and sort by score descending
    return Object.entries(sentimentByTicker)
      .map(([ticker, score]) => ({ ticker, score }))
      .sort((a, b) => b.score - a.score);
  }, [sentimentByTicker]);

  if (mapData.length === 0) {
    return (
      <div className="w-full h-full min-h-[200px] flex items-center justify-center border border-slate-800/50 rounded-xl bg-slate-900/50 backdrop-blur-md">
        <div className="text-slate-500 font-mono text-sm animate-pulse">
          AWAITING NEURAL SENTIMENT DATA...
        </div>
      </div>
    );
  }

  // Color mapping logic: 
  // score ranges from -100 to 100
  const getColor = (score: number) => {
    if (score > 60) return 'bg-emerald-500 text-emerald-950 border-emerald-400';
    if (score > 20) return 'bg-emerald-500/50 text-emerald-100 border-emerald-500/60';
    if (score > -20) return 'bg-slate-800 text-slate-300 border-slate-700';
    if (score > -60) return 'bg-red-500/50 text-red-100 border-red-500/60';
    return 'bg-red-600 text-red-50 border-red-500';
  };

  return (
    <div className="w-full h-full min-h-[300px] flex flex-col border border-slate-800/50 rounded-xl bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl relative group">
      
      {/* Background glow effects */}
      <div className="absolute top-[-50px] left-[-50px] w-32 h-32 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none transition-all duration-1000 group-hover:bg-emerald-500/20" />
      <div className="absolute bottom-[-50px] right-[-50px] w-32 h-32 bg-red-500/10 rounded-full blur-[80px] pointer-events-none transition-all duration-1000 group-hover:bg-red-500/20" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/50 bg-slate-900/40 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <h2 className="text-sm font-bold font-mono tracking-widest text-slate-200 uppercase">
            Live Market Heatmap
          </h2>
        </div>
        <div className="text-[10px] text-slate-500 font-mono border border-slate-800 px-2 py-1 rounded bg-slate-950/50 uppercase tracking-widest">
          Neural Matrix
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar z-10">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5 auto-rows-max">
          {mapData.map((item) => (
            <div
              key={item.ticker}
              className={`
                relative flex flex-col items-center justify-center p-2 rounded-lg border 
                transition-all duration-300 hover:scale-[1.15] hover:z-20 hover:shadow-2xl cursor-pointer
                ${getColor(item.score)}
              `}
              title={`${item.ticker}: ${item.score.toFixed(1)} Sentiment`}
            >
              <span className="text-[9px] font-bold tracking-tighter truncate w-full text-center mix-blend-plus-lighter">
                {item.ticker}
              </span>
              <span className="text-[8px] opacity-80 font-mono mt-0.5 mix-blend-plus-lighter">
                {item.score > 0 ? '+' : ''}{item.score.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
