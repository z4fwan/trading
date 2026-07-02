'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { getAllPredictions, computeTrustMetrics, type StoredPrediction, type TrustMetrics } from '@/lib/predictionStore';

export default function EndOfDayReport() {
  const [showReport, setShowReport] = useState(false);

  const [totalPreds, setTotalPreds] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const check = () => {
      try {
        const all = getAllPredictions();
        setTotalPreds(all.length);
        setPendingCount(all.filter(p => !p.resolved).length);
      } catch {}
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const reportDate = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    if (hours > 15 || (hours === 15 && mins >= 30)) {
      return now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
    }
    return new Date(now.getTime() - 86400000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
  }, []);

  const todaysResolved = useMemo(() => {
    const all: StoredPrediction[] = getAllPredictions();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    return all.filter(p => p.resolved && (p.resolvedAt || 0) >= todayTs);
  }, [showReport]);

  const allResolved = useMemo(() => {
    const all: StoredPrediction[] = getAllPredictions();
    return all.filter(p => p.resolved);
  }, [showReport]);

  const metrics: TrustMetrics | null = useMemo(() => {
    try { return computeTrustMetrics(allResolved); } catch { return null; }
  }, [allResolved]);

  const correct = todaysResolved.filter(p => p.result === 'CORRECT').length;
  const wrong = todaysResolved.filter(p => p.result === 'WRONG').length;
  const partial = todaysResolved.filter(p => p.result === 'PARTIAL').length;
  const todayAccuracy = todaysResolved.length > 0 ? Math.round((correct + partial * 0.5) / todaysResolved.length * 100) : 0;

  const isAccumulating = totalPreds === 0;
  if (isAccumulating) {
    return (
      <div className="border border-slate-800 bg-slate-900/30 rounded-xl backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-3 text-center space-y-2">
          <div className="text-[9px] font-mono text-yellow-400 font-bold">⏳ Initializing</div>
          <div className="text-[7px] font-mono text-slate-500">AI is scanning markets... predictions generating within 60s</div>
          <div className="flex items-center justify-center gap-1.5 text-[7px] font-mono text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Real data streaming
          </div>
        </div>
      </div>
    );
  }
  if (todaysResolved.length === 0 && metrics === null) {
    return (
      <div className="border border-slate-800 bg-slate-900/30 rounded-xl backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-3 text-center">
          <div className="text-[8px] font-mono text-slate-400">{totalPreds} predictions · {pendingCount} pending</div>
          <div className="text-[7px] font-mono text-slate-500 mt-1">First resolution batch within ~15 min</div>
          <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
            <div className="h-1 rounded-full bg-emerald-500/50 animate-pulse" style={{ width: '15%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-800 bg-slate-900/30 rounded-xl backdrop-blur-sm overflow-hidden">
      <button onClick={() => setShowReport(!showReport)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-[10px]">📊</span>
          <span className="text-[9px] font-bold font-mono text-white uppercase tracking-wider">End of Day Report</span>
          {todaysResolved.length > 0 && (
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${todayAccuracy >= 60 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {todayAccuracy}% today
            </span>
          )}
        </div>
        <span className="text-slate-600 text-[8px]">{showReport ? '▲' : '▼'}</span>
      </button>

      {showReport && (
        <div className="px-4 pb-4 space-y-4">
          <div className="text-[7px] font-mono text-slate-600">Report for {reportDate}</div>

          {/* Today's predictions breakdown */}
          {todaysResolved.length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Today&apos;s Resolved Predictions</div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg p-2.5 text-center">
                  <div className="text-[16px] font-bold font-mono text-emerald-400">{correct}</div>
                  <div className="text-[7px] font-mono text-emerald-500/60">Correct</div>
                </div>
                <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-2.5 text-center">
                  <div className="text-[16px] font-bold font-mono text-red-400">{wrong}</div>
                  <div className="text-[7px] font-mono text-red-500/60">Wrong</div>
                </div>
                <div className="bg-yellow-950/30 border border-yellow-900/40 rounded-lg p-2.5 text-center">
                  <div className="text-[16px] font-bold font-mono text-yellow-400">{partial}</div>
                  <div className="text-[7px] font-mono text-yellow-500/60">Partial</div>
                </div>
              </div>

              <div className="bg-slate-950/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] font-mono text-slate-500">Today&apos;s Accuracy</span>
                  <span className={`text-[11px] font-bold font-mono ${todayAccuracy >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{todayAccuracy}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${todayAccuracy >= 60 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${todayAccuracy}%` }} />
                </div>
              </div>

              {/* Per-prediction breakdown */}
              <div className="mt-3 space-y-1 max-h-[200px] overflow-y-auto">
                {todaysResolved.slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-1 px-2 py-1.5 bg-slate-950/40 rounded text-[8px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${p.result === 'CORRECT' ? 'text-emerald-400' : p.result === 'WRONG' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {p.result === 'CORRECT' ? '✓' : p.result === 'WRONG' ? '✗' : '~'}
                      </span>
                      <span className="text-white">{p.ticker}</span>
                      <span className="text-slate-600">{p.direction === 'BULLISH' ? '▲' : '▼'} {p.confidence}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">acc: {p.accuracyPercent?.toFixed(0) || '?'}%</span>
                      {p.failureAnalysis && <span className="text-red-400/60 text-[7px]">{p.failureAnalysis.primaryReason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Trust Score */}
          {metrics && (
            <div className="border-t border-slate-800/60 pt-3">
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">AI Trustability Score</div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/50 rounded-lg p-3">
                  <div className="text-[7px] font-mono text-slate-500">Overall Accuracy</div>
                  <div className={`text-[18px] font-bold font-mono ${metrics.avgAccuracy >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.avgAccuracy.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-3">
                  <div className="text-[7px] font-mono text-slate-500">Trust Score</div>
                  <div className={`text-[18px] font-bold font-mono ${metrics.trustScore >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.trustScore.toFixed(0)}/100</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-slate-950/30 rounded p-2 text-center">
                  <div className="text-[7px] font-mono text-slate-500">Total</div>
                  <div className="text-[11px] font-bold font-mono text-white">{metrics.totalPredictions}</div>
                </div>
                <div className="bg-slate-950/30 rounded p-2 text-center">
                  <div className="text-[7px] font-mono text-slate-500">Avg Dev</div>
                  <div className="text-[11px] font-bold font-mono text-white">{metrics.avgDeviation.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-950/30 rounded p-2 text-center">
                  <div className="text-[7px] font-mono text-slate-500">Avg PnL</div>
                  <div className={`text-[11px] font-bold font-mono ${metrics.avgPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.avgPnL >= 0 ? '+' : ''}{metrics.avgPnL.toFixed(1)}%</div>
                </div>
              </div>

              {metrics.failedPredictions > 0 && (
                <div className="mt-3 bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-mono text-red-400">⚠️ Failed Predictions Analysis</span>
                    <span className="text-[7px] font-mono text-red-400/60">{metrics.failedPredictions} total</span>
                  </div>
                  {metrics.failedPredictions > 0 && (
                    <div className="text-[7px] font-mono text-slate-400 space-y-0.5">
                      <div>• Confidence gap: {metrics.confidenceAccuracyGap.toFixed(1)}% (overconfidence)</div>
                      <div>• Best sectors: {metrics.bestSectors.slice(0, 2).join(', ') || 'N/A'}</div>
                      <div>• Weakest sectors: {metrics.weakestSectors.slice(0, 2).join(', ') || 'N/A'}</div>
                      <div>• Trend: <span className={metrics.trend === 'IMPROVING' ? 'text-emerald-400' : metrics.trend === 'DECLINING' ? 'text-red-400' : 'text-yellow-400'}>{metrics.trend}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
