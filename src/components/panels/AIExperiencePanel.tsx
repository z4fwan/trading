'use client';

import { useMemo, useState, useEffect } from 'react';
import { getTickerStats, getOverallStats, getAllTickerStats, getExperienceAdjustedConfidence, findSimilarSetups, type TickerStats, type PatternMatch } from '@/lib/aiExperienceEngine';
import type { TAIndicators } from '@/lib/technicalAnalysis';
import { classifyRegime } from '@/lib/regimeClassifier';

interface Props {
  ticker?: string;
  taData?: Record<string, TAIndicators>;
  prices?: Record<string, { price: number; name: string }>;
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-slate-950/30 rounded-lg p-2 border border-slate-800/30">
      <div className="text-[6px] uppercase font-bold text-slate-600 tracking-widest font-mono">{label}</div>
      <div className={`text-[9px] font-bold font-mono mt-0.5 ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function AIExperiencePanel({ ticker, taData, prices }: Props) {
  const [selectedTicker, setSelectedTicker] = useState(ticker || '');
  const [allStats, setAllStats] = useState<TickerStats[]>([]);

  useEffect(() => {
    setAllStats(getAllTickerStats());
  }, []);

  const stats: TickerStats | null = useMemo(() => {
    if (!selectedTicker) return null;
    return getTickerStats(selectedTicker);
  }, [selectedTicker]);

  const overall = useMemo(() => getOverallStats(), []);

  const patterns: PatternMatch[] = useMemo(() => {
    if (!selectedTicker || !taData?.[selectedTicker]) return [];
    const ta = taData[selectedTicker];
    const regime = classifyRegime(ta, []);
    const sessionLabel = getSessionLabel();
    return findSimilarSetups(
      selectedTicker, ta.rsi, ta.adx, ta.macd.histogram,
      regime.regime, sessionLabel, new Date().getDay(),
    );
  }, [selectedTicker, taData]);

  // Ticker selector
  const tickerOptions = useMemo(() => {
    const fromStats = allStats.map(s => s.ticker);
    const fromPrices = prices ? Object.keys(prices) : [];
    return [...new Set([...fromStats, ...fromPrices])].sort();
  }, [allStats, prices]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">Experience Engine</div>

      {/* Ticker quick selector */}
      <div className="flex flex-wrap gap-1">
        {tickerOptions.slice(0, 20).map(t => (
          <button key={t} onClick={() => setSelectedTicker(t)}
            className={`text-[7px] font-mono px-2 py-1 rounded-lg transition-all ${
              selectedTicker === t
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800/30 text-slate-500 border border-slate-800/30 hover:border-slate-700/50'
            }`}>
            {t}
          </button>
        ))}
        {tickerOptions.length === 0 && (
          <span className="text-[7px] text-slate-600 font-mono">No tickers with experience data</span>
        )}
      </div>

      {/* Overall Stats */}
      {overall.totalPredictions > 0 && !selectedTicker && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBadge label="Total Experiences" value={overall.totalPredictions} color="text-blue-400" />
          <StatBadge label="Overall Accuracy" value={`${overall.overallAccuracy}%`} color={overall.overallAccuracy >= 60 ? 'text-emerald-400' : 'text-yellow-400'} />
          <StatBadge label="Tickers Tracked" value={overall.totalTickers} />
          <StatBadge label="Avg Return" value={`${overall.avgReturnPerTrade > 0 ? '+' : ''}${overall.avgReturnPerTrade}%`} color={overall.avgReturnPerTrade > 0 ? 'text-emerald-400' : 'text-red-400'} />
        </div>
      )}

      {/* Per-ticker stats */}
      {selectedTicker && stats && (
        <>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold font-mono text-white">{selectedTicker}</span>
              <span className={`text-[9px] font-mono ${
                stats.trend === 'IMPROVING' ? 'text-emerald-400' :
                stats.trend === 'DECLINING' ? 'text-red-400' : 'text-slate-500'
              }`}>{stats.trend}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
              <StatBadge label="Predictions" value={stats.total} />
              <StatBadge label="Accuracy" value={`${stats.accuracy}%`} color={stats.accuracy >= 60 ? 'text-emerald-400' : 'text-red-400'} />
              <StatBadge label="Avg Return" value={`${stats.avgReturn > 0 ? '+' : ''}${stats.avgReturn}%`} color={stats.avgReturn > 0 ? 'text-emerald-400' : 'text-red-400'} />
              <StatBadge label="Recent (10)" value={`${stats.recentAccuracy}%`} />
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[7px] font-mono">
              <div className="bg-slate-950/30 rounded-lg p-1.5 text-center">
                <span className="text-slate-600 block">Best Regime</span>
                <span className="text-emerald-400">{stats.bestRegime}</span>
              </div>
              <div className="bg-slate-950/30 rounded-lg p-1.5 text-center">
                <span className="text-slate-600 block">Best Session</span>
                <span className="text-blue-400">{stats.bestSession}</span>
              </div>
              <div className="bg-slate-950/30 rounded-lg p-1.5 text-center">
                <span className="text-slate-600 block">Best Day</span>
                <span className="text-purple-400">{stats.bestDay}</span>
              </div>
            </div>

            <div className="mt-2 text-[7px] text-slate-600 font-mono">
              Confidence gap: {stats.confidenceGap}% | Correct: {stats.correct} | Partial: {stats.partial} | Wrong: {stats.wrong}
            </div>
          </div>

          {/* Pattern matches */}
          {patterns.length > 0 && (
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
              <div className="text-[9px] font-bold font-mono text-white mb-2">Similar Past Setups</div>
              <div className="space-y-1.5">
                {patterns.map((p, i) => (
                  <div key={i} className="bg-slate-950/30 rounded-lg p-2 border border-slate-800/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono text-slate-300">{p.pattern}</span>
                      <span className={`text-[7px] font-mono ${
                        p.recommendation === 'BUY' ? 'text-emerald-400' :
                        p.recommendation === 'SELL' ? 'text-red-400' : 'text-yellow-400'
                      }`}>{p.recommendation} ({p.confidence.toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[6px] text-slate-600 font-mono">
                      <span>Similarity: {p.similarity}%</span>
                      <span>Sample: {p.sampleSize}</span>
                      {p.pastOutcomes.map((o, j) => (
                        <span key={j}>{o.result}: {o.count}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* All ticker quick view */}
      {!selectedTicker && allStats.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] font-bold font-mono text-white mb-2">All Tracked Tickers</div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {allStats.sort((a, b) => b.total - a.total).slice(0, 20).map(s => (
              <div key={s.ticker}
                onClick={() => setSelectedTicker(s.ticker)}
                className="flex items-center justify-between bg-slate-950/30 rounded-lg p-1.5 text-[7px] font-mono cursor-pointer hover:bg-slate-800/30 transition-all">
                <span className="text-slate-300 font-bold">{s.ticker}</span>
                <div className="flex gap-3">
                  <span className="text-slate-500">{s.total} preds</span>
                  <span className={s.accuracy >= 60 ? 'text-emerald-400' : 'text-red-400'}>{s.accuracy}%</span>
                  <span className={s.trend === 'IMPROVING' ? 'text-emerald-400' : s.trend === 'DECLINING' ? 'text-red-400' : 'text-slate-500'}>{s.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getSessionLabel(): string {
  const h = new Date().getHours();
  if (h >= 15 && h < 16) return 'CLOSING';
  if (h >= 9 && h < 10) return 'OPENING';
  if (h >= 10 && h < 15) return 'MIDDAY';
  if (h >= 16) return 'POST_MARKET';
  return 'PRE_MARKET';
}
