'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { getResolvedPredictions, getAllPredictions, type StoredPrediction } from '@/lib/predictionStore';

function groupByPeriod(predictions: StoredPrediction[], period: 'month' | 'year') {
  const groups: Record<string, { correct: number; wrong: number; partial: number; total: number; pct: number }> = {};
  for (const p of predictions) {
    if (!p.createdAt) continue;
    const d = new Date(p.createdAt);
    const key = period === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : `${d.getFullYear()}`;
    if (!groups[key]) groups[key] = { correct: 0, wrong: 0, partial: 0, total: 0, pct: 0 };
    groups[key].total++;
    if (p.result === 'CORRECT') groups[key].correct++;
    else if (p.result === 'WRONG') groups[key].wrong++;
    else if (p.result === 'PARTIAL') groups[key].partial++;
  }
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    g.pct = g.total > 0 ? Math.round((g.correct + g.partial * 0.5) / g.total * 100) : 0;
  }
  return groups;
}

function computeRollingAccuracy(predictions: StoredPrediction[], windowDays: number) {
  if (predictions.length === 0) return [];
  const sorted = [...predictions].sort((a, b) => (a.resolvedAt || a.createdAt) - (b.resolvedAt || b.createdAt));
  const now = Date.now();
  const points: { date: string; accuracy: number; count: number }[] = [];
  let cursor = now - windowDays * 86400000 * 5;
  const end = now;
  while (cursor <= end) {
    const windowStart = cursor - windowDays * 86400000;
    const inWindow = sorted.filter(p => {
      const t = p.resolvedAt || p.createdAt;
      return t >= windowStart && t < cursor;
    });
    if (inWindow.length >= 3) {
      const correct = inWindow.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length;
      points.push({
        date: new Date(cursor).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        accuracy: Math.round((correct / inWindow.length) * 100),
        count: inWindow.length,
      });
    }
    cursor += windowDays * 86400000;
  }
  return points.slice(-20);
}

function computeLearningCurve(predictions: StoredPrediction[]) {
  const sorted = [...predictions].sort((a, b) => (a.resolvedAt || a.createdAt) - (b.resolvedAt || b.createdAt));
  const chunkSize = Math.max(5, Math.ceil(sorted.length / 20));
  const chunks: { label: string; accuracy: number; count: number }[] = [];
  for (let i = 0; i < sorted.length; i += chunkSize) {
    const chunk = sorted.slice(i, i + chunkSize);
    const correct = chunk.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length;
    chunks.push({
      label: `#${Math.floor(i / chunkSize) + 1}`,
      accuracy: Math.round((correct / chunk.length) * 100),
      count: chunk.length,
    });
  }
  return chunks;
}

export default function LearningProgress() {
  const [expanded, setExpanded] = useState(false);
  const [totalPreds, setTotalPreds] = useState(0);
  const [pendingPreds, setPendingPreds] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const check = () => {
      try {
        const all = getAllPredictions();
        setTotalPreds(all.length);
        setPendingPreds(all.filter(p => !p.resolved).length);
      } catch {}
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const resolved = useMemo(() => {
    try { return getResolvedPredictions(); } catch { return []; }
  }, [expanded, totalPreds]);

  const monthly = useMemo(() => groupByPeriod(resolved, 'month'), [resolved]);
  const yearly = useMemo(() => groupByPeriod(resolved, 'year'), [resolved]);
  const rolling = useMemo(() => computeRollingAccuracy(resolved, 7), [resolved]);
  const curve = useMemo(() => computeLearningCurve(resolved), [resolved]);

  const sortedMonths = Object.keys(monthly).sort();
  const sortedYears = Object.keys(yearly).sort();

  const latestMonthAcc = sortedMonths.length > 0 ? monthly[sortedMonths[sortedMonths.length - 1]].pct : 0;
  const prevMonthAcc = sortedMonths.length > 1 ? monthly[sortedMonths[sortedMonths.length - 2]].pct : 0;
  const monthImprovement = prevMonthAcc > 0 ? latestMonthAcc - prevMonthAcc : 0;

  const latestYear = sortedYears.length > 0 ? yearly[sortedYears[sortedYears.length - 1]] : null;
  const prevYear = sortedYears.length > 1 ? yearly[sortedYears[sortedYears.length - 2]] : null;
  const yearImprovement = prevYear ? (latestYear?.pct || 0) - prevYear.pct : 0;

  const firstCurveAcc = curve.length > 0 ? curve[0].accuracy : 0;
  const lastCurveAcc = curve.length > 0 ? curve[curve.length - 1].accuracy : 0;
  const learningImprovement = firstCurveAcc > 0 ? lastCurveAcc - firstCurveAcc : 0;

  if (!mounted) return null;

  const isAccumulating = totalPreds === 0;

  return (
    <div className="border border-slate-800 bg-slate-900/30 rounded-xl backdrop-blur-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-[10px]">📈</span>
          <span className="text-[9px] font-bold font-mono text-white uppercase tracking-wider">AI Learning Progress</span>
          {isAccumulating && <span className="text-[7px] font-mono text-yellow-400 animate-pulse">⏳ Initializing...</span>}
          {!isAccumulating && pendingPreds > 0 && <span className="text-[7px] font-mono text-slate-500">{pendingPreds} pending</span>}
          {!isAccumulating && learningImprovement !== 0 && (
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${learningImprovement >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {learningImprovement >= 0 ? '+' : ''}{learningImprovement}%
            </span>
          )}
        </div>
        <span className="text-slate-600 text-[8px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {isAccumulating ? (
            <div className="text-center py-6 space-y-2">
              <div className="text-[20px]">📊</div>
              <div className="text-[9px] font-mono text-yellow-400 font-bold">Accumulating Prediction Data</div>
              <div className="text-[7px] font-mono text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                AI is analyzing real-time market data. Predictions will be generated within 60 seconds and resolve after 15 minutes for hourly forecasts. Learning metrics will appear automatically.
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[7px] font-mono text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real data streaming · Waiting for predictions...
              </div>
            </div>
          ) : resolved.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <div className="text-[9px] font-mono text-slate-400">{totalPreds} predictions generated</div>
              <div className="text-[7px] font-mono text-slate-500">First batch resolving within ~15 min</div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                <div className="h-1.5 rounded-full bg-emerald-500/50 animate-pulse" style={{ width: '30%' }} />
              </div>
            </div>
          ) : (
            <>
          {/* Current snapshot cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-[7px] font-mono text-slate-500">This Month</div>
              <div className={`text-[16px] font-bold font-mono ${latestMonthAcc >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{latestMonthAcc}%</div>
              {monthImprovement !== 0 && (
                <div className={`text-[7px] font-mono ${monthImprovement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {monthImprovement >= 0 ? '▲' : '▼'} {Math.abs(monthImprovement)}%
                </div>
              )}
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-[7px] font-mono text-slate-500">Yearly Avg</div>
              <div className={`text-[16px] font-bold font-mono ${latestYear?.pct && latestYear.pct >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{latestYear?.pct || 0}%</div>
              {yearImprovement !== 0 && prevYear && (
                <div className={`text-[7px] font-mono ${yearImprovement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {yearImprovement >= 0 ? '▲' : '▼'} {Math.abs(yearImprovement)}%
                </div>
              )}
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-[7px] font-mono text-slate-500">Learning Gain</div>
              <div className={`text-[16px] font-bold font-mono ${learningImprovement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{learningImprovement >= 0 ? '+' : ''}{learningImprovement}%</div>
              <div className="text-[7px] font-mono text-slate-500">from {curve.length} stages</div>
            </div>
          </div>

          {/* Monthly accuracy bars */}
          {sortedMonths.length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Monthly Accuracy</div>
              <div className="space-y-1 max-h-[180px] overflow-y-auto custom-scrollbar">
                {sortedMonths.slice(-12).map(month => {
                  const g = monthly[month];
                  return (
                    <div key={month} className="flex items-center gap-2 text-[7px] font-mono">
                      <span className="text-slate-400 w-14 shrink-0">{month}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full ${g.pct >= 60 ? 'bg-emerald-500' : g.pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${g.pct}%` }} />
                      </div>
                      <span className={`w-7 text-right font-bold ${g.pct >= 60 ? 'text-emerald-400' : g.pct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{g.pct}%</span>
                      <span className="text-slate-600 w-8 text-right">({g.total})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Yearly accuracy */}
          {sortedYears.length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Yearly Accuracy</div>
              <div className="flex flex-wrap gap-3">
                {sortedYears.map(year => {
                  const g = yearly[year];
                  const isLatest = year === sortedYears[sortedYears.length - 1];
                  return (
                    <div key={year} className={`flex-1 min-w-[100px] bg-slate-950/50 rounded-lg p-2 text-center border ${isLatest ? 'border-emerald-800/40' : 'border-slate-800/40'}`}>
                      <div className="text-[7px] font-mono text-slate-500">{year}</div>
                      <div className={`text-[14px] font-bold font-mono ${g.pct >= 60 ? 'text-emerald-400' : g.pct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{g.pct}%</div>
                      <div className="text-[7px] font-mono text-slate-600">{g.total} preds</div>
                      <div className="w-full bg-slate-800 rounded-full h-1 mt-1">
                        <div className={`h-full rounded-full ${g.pct >= 60 ? 'bg-emerald-500' : g.pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${g.pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly rolling accuracy trend */}
          {rolling.length >= 3 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">7-Day Rolling Accuracy (Recent)</div>
              <div className="flex items-end gap-1 h-20">
                {rolling.slice(-10).map((point, i) => {
                  const maxAcc = Math.max(...rolling.slice(-10).map(p => p.accuracy));
                  const height = maxAcc > 0 ? (point.accuracy / maxAcc) * 100 : 0;
                  const isUp = i > 0 && point.accuracy >= rolling.slice(-10)[i - 1].accuracy;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="flex-1 w-full flex items-end">
                        <div className={`w-full rounded-t ${point.accuracy >= 60 ? 'bg-emerald-500/70' : point.accuracy >= 40 ? 'bg-yellow-500/70' : 'bg-red-500/70'}`}
                          style={{ height: `${height}%`, minHeight: '4px' }} />
                      </div>
                      <span className="text-[5px] font-mono text-slate-600">{point.date}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[6px] font-mono text-slate-600">← older</span>
                <span className="text-[6px] font-mono text-slate-600">recent →</span>
              </div>
            </div>
          )}

          {/* Learning curve - show improvement over prediction stages */}
          {curve.length >= 3 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Accuracy Learning Curve (by resolution order)</div>
              <div className="flex items-end gap-0.5 h-16">
                {curve.map((point, i) => {
                  const maxCurve = Math.max(...curve.map(p => p.accuracy));
                  const height = maxCurve > 0 ? (point.accuracy / maxCurve) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex items-end">
                      <div className={`w-full rounded-t ${point.accuracy >= 60 ? 'bg-purple-500/70' : point.accuracy >= 40 ? 'bg-yellow-500/70' : 'bg-red-500/70'}`}
                        style={{ height: `${height}%`, minHeight: '3px' }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[6px] font-mono text-slate-600 mt-0.5">
                <span>Earliest</span>
                <span>Latest</span>
              </div>
            </div>
          )}

          {/* Summary sentiment */}
          {sortedMonths.length >= 2 && (
            <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/50">
              <div className="flex items-start gap-2 text-[7px] font-mono">
                <span className={learningImprovement >= 2 ? 'text-emerald-400' : learningImprovement <= -2 ? 'text-red-400' : 'text-yellow-400'}>
                  {learningImprovement >= 2 ? '📗' : learningImprovement <= -2 ? '📕' : '📙'}
                </span>
                <div>
                  <span className="text-slate-300 font-bold">AI Learning Assessment: </span>
                  <span className="text-slate-400">
                    {learningImprovement >= 5
                      ? `Strong improvement (+${learningImprovement}%) — AI is effectively learning from its mistakes.`
                      : learningImprovement >= 2
                      ? `Moderate improvement (+${learningImprovement}%) — AI is gradually refining its strategies.`
                      : learningImprovement <= -5
                      ? `Declining (${learningImprovement}%) — Market conditions may have shifted.`
                      : learningImprovement <= -2
                      ? `Slight decline (${learningImprovement}%) — AI needs more data to adapt.`
                      : `Stable (${learningImprovement >= 0 ? '+' : ''}${learningImprovement}%) — Consistent performance.`
                    }
                    {' '}Monthly trend: {monthImprovement >= 0 ? '+' : ''}{monthImprovement}% ·
                    {' '}Total resolved: {resolved.length}
                  </span>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
