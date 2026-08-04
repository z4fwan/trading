import React from 'react';

export default function SignalDrawer({ item, onClose }: { item: any, onClose: () => void }) {
  if (!item) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h2 className="text-lg font-bold text-white font-mono">Signal Audit Trail</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Verification Status */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">1. Source Verification</h3>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400 text-sm font-mono">Score</span>
              <span className={`text-lg font-bold font-mono ${item.verificationScore >= 70 || item.verificationScore === undefined ? 'text-emerald-400' : 'text-amber-400'}`}>
                {item.verificationScore !== undefined ? item.verificationScore : '\u2014'} / 100
              </span>
            </div>
            <div className="space-y-1 mt-3 pt-3 border-t border-slate-800/50">
              {item.verificationSources?.map((src: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <span className={src.confirmed ? "text-emerald-400" : "text-slate-500"}>{src.confirmed ? '✓' : '⚠'}</span>
                  <span className="text-slate-300">{src.name}</span>
                </div>
              )) || (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-emerald-400">✓</span>
                  <span className="text-slate-300">{item.company_name || 'Verified Source'}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Original Text */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">2. Raw Announcement</h3>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <h4 className="text-sm font-bold text-white mb-2">{item.headline}</h4>
            <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap">
              {item.full_text || item.summary || 'No detailed text available.'}
            </p>
          </div>
        </section>

        {/* LLM Extraction */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">3. LLM Extraction</h3>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-slate-500 block mb-1">Tickers</span>
                <span className="text-blue-400 font-bold">{item.symbol}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Event Type</span>
                <span className="text-purple-400 font-bold">{item.ai_analysis?.event_type || 'GENERAL'}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Sentiment</span>
                <span className={item.sentiment === 'BULLISH' ? 'text-emerald-400 font-bold' : item.sentiment === 'BEARISH' ? 'text-red-400 font-bold' : 'text-slate-300 font-bold'}>
                  {item.sentiment || item.ai_analysis?.finbert_sentiment || 'NEUTRAL'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Impact Lvl</span>
                <span className={`font-bold ${item.llmImpactLevel === 'HIGH' ? 'text-red-400' : item.llmImpactLevel === 'MODERATE' ? 'text-amber-400' : 'text-slate-400'}`}>
                  {item.llmImpactLevel || (item.ai_analysis?.ensemble_confidence > 75 ? 'HIGH' : item.ai_analysis?.ensemble_confidence > 50 ? 'MODERATE' : 'LOW')}
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800">
              <span className="text-slate-500 block mb-2">Reasoning</span>
              <p className="text-slate-300 leading-relaxed">{item.ai_analysis?.llm_reasoning || 'Reasoning extracted via pipeline.'}</p>
            </div>
          </div>
        </section>

        {/* Technical & Historical */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">4. Quantitative Context</h3>
          <div className="bg-slate-950 rounded-lg border border-slate-800 divide-y divide-slate-800">
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">Historical Matches</span>
              <span className="text-xs font-mono text-white font-bold">{item.similar_historical?.count || '\u2014'} found</span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">Hist. Win Rate</span>
              <span className="text-xs font-mono text-emerald-400 font-bold">{item.v5_intelligence?.historical_win_rate ? `${(item.v5_intelligence.historical_win_rate * 100).toFixed(1)}%` : '\u2014'}</span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">RSI Snapshot</span>
              <span className="text-xs font-mono text-white font-bold">{item.context?.rsi ?? '\u2014'}</span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">Relative Volume</span>
              <span className="text-xs font-mono text-amber-400 font-bold">{item.context?.relative_volume ? `${item.context.relative_volume.toFixed(1)}x` : '\u2014'}</span>
            </div>
          </div>
        </section>
      </div>
      
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <button 
          onClick={onClose}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors font-mono tracking-widest uppercase text-sm"
        >
          Close Audit Trail
        </button>
      </div>
    </div>
  );
}
