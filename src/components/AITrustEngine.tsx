'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import {
  getAllPredictions, resolvePending, computeTrustMetrics,
  type StoredPrediction, type TrustMetrics,
} from '@/lib/predictionStore';
import { computeCalibration } from '@/lib/calibrationEngine';
import { runWalkForwardBacktest, compareMLvsRuleBased, type BacktestMetrics, type ABTestResult as BtABTestResult } from '@/lib/backtestEngine';
import { getAILearningSnapshot, getAIIndicatorWeights, getAIIndicatorPerformance, getAIFailurePatterns } from '@/lib/aiLearningIntegration';

function TrustGauge({ score, resolvedCount, trueTrustScore }: { score: number; resolvedCount?: number; trueTrustScore?: number }) {
  const isCalibrating = resolvedCount !== undefined && resolvedCount < 10;
  const calibratingLabel = `Building trust data (${resolvedCount || 0}/10 resolved)`;
  const displayScore = trueTrustScore !== undefined ? trueTrustScore : score;
  const gaugeScore = isCalibrating ? Math.max(displayScore, 35) : displayScore;
  const color = isCalibrating ? '#eab308' : gaugeScore >= 80 ? '#22c55e' : gaugeScore >= 60 ? '#eab308' : gaugeScore >= 40 ? '#f97316' : '#ef4444';
  const label = isCalibrating ? calibratingLabel : gaugeScore >= 80 ? 'HIGH TRUST' : gaugeScore >= 60 ? 'MODERATE TRUST' : gaugeScore >= 40 ? 'LOW TRUST' : 'CRITICAL';
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 shrink-0">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle cx="36" cy="36" r="30" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(gaugeScore / 100) * 188.5} 188.5`}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold font-mono" style={{ color }}>{gaugeScore.toFixed(0)}</span>
        </div>
      </div>
      <div>
        <div className="text-xs font-bold font-mono" style={{ color }}>{label}</div>
        <div className="text-[8px] text-slate-500 font-mono mt-0.5">AI Trust Score</div>
      </div>
    </div>
  );
}

function StatusBadge({ result }: { result: string | undefined }) {
  if (!result) return <span className="text-[8px] font-mono text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-800/50 border border-slate-700">PENDING</span>;
  if (result === 'CORRECT') return <span className="text-[8px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">✅ CORRECT</span>;
  if (result === 'WRONG') return <span className="text-[8px] font-mono font-bold text-red-400 px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30">❌ WRONG</span>;
  return <span className="text-[8px] font-mono font-bold text-yellow-400 px-1.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30">🟡 PARTIAL</span>;
}

export default function AITrustEngine() {
  const { stocks, getHistory } = useMarketData();
  const [predictions, setPredictions] = useState<StoredPrediction[]>([]);
  const [metrics, setMetrics] = useState<TrustMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'HISTORY' | 'ANALYSIS' | 'SECTORS' | 'CALIBRATION' | 'LEARNING'>('OVERVIEW');
  const [selectedPred, setSelectedPred] = useState<StoredPrediction | null>(null);

  const [abTest, setAbTest] = useState<BtABTestResult | null>(null);
  const [backtest, setBacktest] = useState<BacktestMetrics | null>(null);
  const stocksRef = useRef(stocks);
  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;

  useEffect(() => { stocksRef.current = stocks; }, [stocks]);

  useEffect(() => {
    const doResolve = () => {
      const priceMap: Record<string, { price: number }> = {};
      for (const [t, s] of Object.entries(stocksRef.current)) {
        if (s?.price > 0) priceMap[t] = { price: s.price };
      }
      resolvePending(priceMap);
      queueMicrotask(() => {
        setPredictions(getAllPredictions());
        setMetrics(computeTrustMetrics());
      });
    };
    doResolve();
    const timer = setInterval(doResolve, 30000);
    return () => clearInterval(timer);
  }, []);

  // Compute calibration from resolved predictions
  const calibration = useMemo(() => {
    const resolved = predictions.filter(p => p.resolved && p.result);
    if (resolved.length < 5) return null;
    const confidences = resolved.map(p => p.confidence / 100);
    const correct = resolved.map(p => p.result === 'CORRECT');
    return computeCalibration(confidences, correct);
  }, [predictions]);

  // Run backtest + A/B comparison on available history
  useEffect(() => {
    const allTickers = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN'];
    for (const ticker of allTickers) {
      const hist = getHistoryRef.current(ticker);
      if (hist && hist.length >= 120) {
        const bt = runWalkForwardBacktest(hist);
        const ab = compareMLvsRuleBased(hist);
        queueMicrotask(() => {
          setBacktest(bt);
          if (ab) setAbTest(ab);
        });
        break;
      }
    }
  }, []);

  const resolvedPreds = useMemo(() => predictions.filter(p => p.resolved), [predictions]);
  const pendingPreds = useMemo(() => predictions.filter(p => !p.resolved), [predictions]);

  // True trust score = (Correct Trades / Total Trades) * 100, only effective after 20 resolved
  const trueTrustScore = useMemo(() => {
    if (resolvedPreds.length < 20) return undefined;
    const correct = resolvedPreds.filter(p => p.result === 'CORRECT').length;
    return (correct / resolvedPreds.length) * 100;
  }, [resolvedPreds]);

  const allPending = useMemo(() => predictions.length > 0 && resolvedPreds.length === 0, [predictions.length, resolvedPreds.length]);
  const recentResolved = useMemo(() => [...resolvedPreds].sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)), [resolvedPreds]);

  const confidenceChart = useMemo(() => {
    if (resolvedPreds.length === 0) return null;
    const buckets = [
      { label: '30-50%', range: [30, 50] as [number, number], correct: 0, total: 0 },
      { label: '50-70%', range: [50, 70] as [number, number], correct: 0, total: 0 },
      { label: '70-85%', range: [70, 85] as [number, number], correct: 0, total: 0 },
      { label: '85%+', range: [85, 101] as [number, number], correct: 0, total: 0 },
    ];
    for (const p of resolvedPreds) {
      for (const b of buckets) {
        if (p.confidence >= b.range[0] && p.confidence < b.range[1]) {
          b.total++;
          if (p.result === 'CORRECT') b.correct++;
        }
      }
    }
    return buckets;
  }, [resolvedPreds]);

  const trendData = useMemo(() => {
    if (resolvedPreds.length < 5) return null;
    const sorted = [...resolvedPreds].sort((a, b) => (a.resolvedAt || 0) - (b.resolvedAt || 0));
    const window = 5;
    const points: { week: string; accuracy: number }[] = [];
    for (let i = 0; i < sorted.length; i += window) {
      const slice = sorted.slice(i, i + window);
      const correct = slice.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length;
      points.push({
        week: new Date(slice[0].resolvedAt || 0).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        accuracy: (correct / slice.length) * 100,
      });
    }
    return points;
  }, [resolvedPreds]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight">AI Trust Engine — Prediction Verification</h2>
          <p className="text-[9px] text-slate-500 font-mono">Transparent, self-evaluating prediction intelligence — never fake, always validated</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-slate-600 font-mono">{predictions.length} total predictions</span>
          <button onClick={() => { const m: Record<string, { price: number }> = {}; for (const [t, s] of Object.entries(stocks)) { if (s?.price > 0) m[t] = { price: s.price }; } resolvePending(m); setPredictions(getAllPredictions()); setMetrics(computeTrustMetrics()); }}
            className="text-[9px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 px-2 py-1 rounded-lg hover:bg-emerald-950/50 transition-all">
            ↻ Resolve Now
          </button>
        </div>
      </div>

      {/* Trust Score Header */}
      {metrics && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5 backdrop-blur-sm">
          {allPending ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-3xl">⏳</div>
              <div className="text-[10px] font-bold font-mono text-yellow-400">AI Trust Engine is Warming Up</div>
              <div className="text-[8px] font-mono text-slate-500 max-w-sm mx-auto leading-relaxed">
                {metrics.totalPredictions} predictions generated. First batch resolves in ~15 minutes (HOURLY expiry).
                Live market data is streaming — metrics will populate automatically as predictions expire.
              </div>
              <div className="flex items-center justify-center gap-2 text-[7px] font-mono text-slate-600">
                <div className="flex -space-x-1">
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="h-2 w-2 rounded-full bg-emerald-500/60 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                  ))}
                </div>
                <span>{metrics.pendingResolutions} predictions pending · Resolving against live prices</span>
              </div>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <TrustGauge score={metrics.trustScore} resolvedCount={resolvedPreds.length} trueTrustScore={trueTrustScore} />
            </div>
            <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider font-mono">Total Pred.</div>
                <div className="text-lg font-bold font-mono text-white mt-1">{metrics.totalPredictions}</div>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider font-mono">Success Rate</div>
                <div className={`text-lg font-bold font-mono mt-1 ${metrics.avgAccuracy >= 70 ? 'text-emerald-400' : metrics.avgAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{metrics.avgAccuracy.toFixed(0)}%</div>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider font-mono">Avg Deviation</div>
                <div className={`text-lg font-bold font-mono mt-1 ${metrics.avgDeviation <= 20 ? 'text-emerald-400' : metrics.avgDeviation <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{metrics.avgDeviation.toFixed(1)}%</div>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider font-mono">Avg PnL</div>
                <div className={`text-lg font-bold font-mono mt-1 ${metrics.avgPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.avgPnL >= 0 ? '+' : ''}{metrics.avgPnL.toFixed(2)}%</div>
              </div>
            </div>
          </div>

          {/* Confidence vs accuracy row */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-[8px] font-mono">
            <div className="bg-slate-950/30 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Daily Acc</span>
              <span className={`font-bold ${metrics.dailyAccuracy >= 70 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.dailyAccuracy.toFixed(0)}%</span>
            </div>
            <div className="bg-slate-950/30 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Weekly Acc</span>
              <span className={`font-bold ${metrics.weeklyAccuracy >= 65 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.weeklyAccuracy.toFixed(0)}%</span>
            </div>
            <div className="bg-slate-950/30 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Monthly Acc</span>
              <span className={`font-bold ${metrics.monthlyAccuracy >= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.monthlyAccuracy.toFixed(0)}%</span>
            </div>
            <div className="bg-slate-950/30 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Conf Reliability</span>
              <span className={`font-bold ${metrics.confidenceReliability >= 70 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.confidenceReliability.toFixed(0)}%</span>
            </div>
            <div className="bg-slate-950/30 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Trend</span>
              <span className={`font-bold ${metrics.trend === 'IMPROVING' ? 'text-emerald-400' : metrics.trend === 'STABLE' ? 'text-yellow-400' : 'text-red-400'}`}>{metrics.trend}</span>
            </div>
          </div>

          {/* Learning progress row */}
          {(() => {
            const snapshot = getAILearningSnapshot();
            if (snapshot.totalResolvedPredictions === 0) return null;
            return (
              <div className="mt-4 flex flex-wrap gap-3 text-[8px] font-mono">
                <div className="bg-slate-950/30 rounded-lg px-3 py-1.5 border border-slate-800/40 flex items-center gap-2">
                  <span className="text-slate-500">🧠 Learning:</span>
                  <span className="text-white font-bold">{snapshot.totalPredictionsAnalyzed} analyzed</span>
                </div>
                <div className="bg-slate-950/30 rounded-lg px-3 py-1.5 border border-slate-800/40 flex items-center gap-2">
                  <span className="text-slate-500">Calibration:</span>
                  <span className={`font-bold ${snapshot.calibrationQuality === 'EXCELLENT' ? 'text-emerald-400' : snapshot.calibrationQuality === 'GOOD' ? 'text-green-400' : 'text-yellow-400'}`}>{snapshot.calibrationQuality}</span>
                </div>
                <div className="bg-slate-950/30 rounded-lg px-3 py-1.5 border border-slate-800/40 flex items-center gap-2">
                  <span className="text-slate-500">Best indicator:</span>
                  <span className="text-emerald-400 font-bold">{snapshot.strongestIndicator || '—'}</span>
                </div>
                <div className="bg-slate-950/30 rounded-lg px-3 py-1.5 border border-slate-800/40 flex items-center gap-2">
                  <span className="text-slate-500">⏱ Days active:</span>
                  <span className="text-white font-bold">{snapshot.daysActive}</span>
                </div>
              </div>
            );
          })()}
          </>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
        <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-xl gap-0.5 min-w-max">
          {([
            { key: 'OVERVIEW', label: '📊 Overview' },
            { key: 'HISTORY', label: '📜 History' },
            { key: 'CALIBRATION', label: '📐 Calibration' },
            { key: 'ANALYSIS', label: '🔬 Analysis' },
            { key: 'SECTORS', label: '🏢 Sectors' },
            { key: 'LEARNING', label: '🧠 Learning' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === tab.key ? 'bg-slate-800 text-emerald-400 border border-slate-700 font-mono shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-5">
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center hover:border-emerald-700/40 transition-all">
              <div className="text-2xl font-bold font-mono text-emerald-400">{metrics?.successfulPredictions || 0}</div>
              <div className="text-[8px] text-slate-500 font-mono mt-1 uppercase tracking-wider">Correct</div>
            </div>
            <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center hover:border-red-700/40 transition-all">
              <div className="text-2xl font-bold font-mono text-red-400">{metrics?.failedPredictions || 0}</div>
              <div className="text-[8px] text-slate-500 font-mono mt-1 uppercase tracking-wider">Failed</div>
            </div>
            <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center hover:border-yellow-700/40 transition-all">
              <div className="text-2xl font-bold font-mono text-yellow-400">{metrics?.partialPredictions || 0}</div>
              <div className="text-[8px] text-slate-500 font-mono mt-1 uppercase tracking-wider">Partial</div>
            </div>
            <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center hover:border-slate-700/40 transition-all">
              <div className="text-2xl font-bold font-mono text-slate-400">{metrics?.pendingResolutions || 0}</div>
              <div className="text-[8px] text-slate-500 font-mono mt-1 uppercase tracking-wider">Pending</div>
            </div>
          </div>

          {/* Confidence reliability chart */}
          {confidenceChart && (
            <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">Confidence Reliability Analysis</div>
              <div className="space-y-2">
                {confidenceChart.map(b => {
                  const reliability = b.total > 0 ? (b.correct / b.total) * 100 : 0;
                  return (
                    <div key={b.label} className="flex items-center gap-3 text-[8px] font-mono">
                      <span className="text-slate-500 w-12 shrink-0">{b.label}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden flex">
                        {b.total > 0 && (
                          <>
                            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${(b.correct / b.total) * 100}%` }} />
                            <div className="h-full bg-red-500/60 transition-all duration-700" style={{ width: `${((b.total - b.correct) / b.total) * 100}%` }} />
                          </>
                        )}
                      </div>
                      <span className="text-slate-400 w-8 text-right">{b.total}</span>
                      <span className={`font-bold w-10 text-right ${reliability >= 70 ? 'text-emerald-400' : reliability >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {reliability.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              {metrics && (
                <div className="mt-3 p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 text-[8px] font-mono">
                  <span className="text-slate-500">Confidence-Accuracy Gap: </span>
                  <span className={`font-bold ${metrics.confidenceAccuracyGap <= 15 ? 'text-emerald-400' : metrics.confidenceAccuracyGap <= 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {metrics.confidenceAccuracyGap.toFixed(1)}%
                  </span>
                  <span className="text-slate-600 ml-2">— Avg confidence: {metrics.avgConfidence.toFixed(0)}% vs avg accuracy: {metrics.avgAccuracy.toFixed(0)}%</span>
                </div>
              )}
            </div>
          )}

          {/* Accuracy timeline */}
          {trendData && (
            <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">Accuracy Trend (Rolling Windows)</div>
              <div className="flex items-end gap-2 h-24">
                {trendData.map((p, i) => {
                  const height = Math.max(8, p.accuracy);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className={`text-[6px] font-mono font-bold ${p.accuracy >= 70 ? 'text-emerald-400' : p.accuracy >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{p.accuracy.toFixed(0)}%</span>
                      <div className="w-full bg-slate-800 rounded-t-sm" style={{ height: `${height * 2.4}px` }}>
                        <div className={`w-full rounded-t-sm transition-all duration-700 ${p.accuracy >= 70 ? 'bg-emerald-500' : p.accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ height: `${height}%` }} />
                      </div>
                      <span className="text-[6px] text-slate-600 font-mono">{p.week}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {predictions.length === 0 && (
            <div className="text-center py-16 border border-slate-800 rounded-2xl">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-[10px] text-slate-500 font-mono">No prediction data yet. Predictions from AI Quant Engine and Weekly Predictions will appear here automatically as they are generated and resolved.</p>
            </div>
          )}
        </div>
      )}

      {/* HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">📜 Full Prediction History — {predictions.length} records</span>
            <div className="flex gap-2 text-[8px] font-mono">
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">✅ {metrics?.successfulPredictions || 0} correct</span>
              <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">❌ {metrics?.failedPredictions || 0} wrong</span>
              <span className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">🟡 {metrics?.partialPredictions || 0} partial</span>
            </div>
          </div>

          {/* Resolved predictions */}
          {recentResolved.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest font-mono mb-2">Resolved Predictions</div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {recentResolved.slice(0, 50).map(p => (
                  <div key={p.id}
                    className="flex items-center justify-between bg-slate-950/30 border border-slate-800/50 rounded-lg px-3 py-2 text-[8px] font-mono cursor-pointer hover:border-slate-700/70 transition-all"
                    onClick={() => setSelectedPred(selectedPred?.id === p.id ? null : p)}>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-[10px]">{p.ticker}</span>
                      <StatusBadge result={p.result} />
                      <span className={`text-[7px] ${p.direction === 'BULLISH' ? 'text-emerald-400' : p.direction === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>
                        {p.direction} @ {p.confidence}%
                      </span>
                      <span className="text-slate-600 text-[7px]">{p.predictionType}</span>
                      {p.source === 'WEEKLY_PREDICTIONS' && <span className="text-[6px] text-blue-400 bg-blue-950/30 px-1 rounded border border-blue-900/50">WEEKLY</span>}
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>${p.entryPrice.toFixed(2)} → ${p.targetPrice.toFixed(2)}</span>
                      {p.actualPrice && <span>Actual: ${p.actualPrice.toFixed(2)}</span>}
                      {p.accuracyPercent != null && (
                        <span className={`font-bold ${p.accuracyPercent >= 70 ? 'text-emerald-400' : p.accuracyPercent >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {p.accuracyPercent.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {selectedPred?.id === p.id && p.failureAnalysis && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl">
                        <div className="text-[8px] font-bold text-red-400 font-mono mb-2">🧠 AI Failure Analysis</div>
                        <div className="text-[9px] text-slate-300 leading-relaxed mb-2">{p.failureAnalysis.detail}</div>
                        <div className="flex flex-wrap gap-1.5 text-[7px] font-mono">
                          {p.failureAnalysis.volatilitySpike && <span className="bg-red-500/15 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded">⚡ Volatility Spike</span>}
                          {p.failureAnalysis.regimeChange && <span className="bg-purple-500/15 text-purple-400 border border-purple-900/40 px-1.5 py-0.5 rounded">🔄 Regime Change</span>}
                          {p.failureAnalysis.momentumFailure && <span className="bg-orange-500/15 text-orange-400 border border-orange-900/40 px-1.5 py-0.5 rounded">📉 Momentum Failure</span>}
                          {p.failureAnalysis.institutionalSelling && <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-900/40 px-1.5 py-0.5 rounded">🏛️ Institutional Selling</span>}
                          {p.failureAnalysis.earningsImpact && <span className="bg-blue-500/15 text-blue-400 border border-blue-900/40 px-1.5 py-0.5 rounded">📊 Earnings Impact</span>}
                          {p.failureAnalysis.newsEvent && <span className="bg-pink-500/15 text-pink-400 border border-pink-900/40 px-1.5 py-0.5 rounded">📰 News Event</span>}
                          {p.failureAnalysis.resistanceRejection && <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-900/40 px-1.5 py-0.5 rounded">🔴 Resistance Rejection</span>}
                          {p.failureAnalysis.lowLiquidity && <span className="bg-slate-500/15 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">💧 Low Liquidity</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending predictions */}
          {pendingPreds.length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest font-mono mb-2">Active Predictions (Awaiting Resolution)</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {pendingPreds.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/30 border border-slate-800/50 rounded-lg px-3 py-2 text-[8px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{p.ticker}</span>
                      <span className={`text-[7px] ${p.direction === 'BULLISH' ? 'text-emerald-400' : p.direction === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>{p.direction} @ {p.confidence}%</span>
                      <StatusBadge result={undefined} />
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Entry ${p.entryPrice.toFixed(2)}</span>
                      <span>Target ${p.targetPrice.toFixed(2)}</span>
                      <span className="text-yellow-400">Expires {p.expiryDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {predictions.length === 0 && (
            <div className="text-center py-16">
              <div className="text-3xl mb-2">📜</div>
              <p className="text-[10px] text-slate-500 font-mono">No prediction history yet. Predictions will appear here once generated by the AI Quant Engine or Weekly Predictions.</p>
            </div>
          )}
        </div>
      )}

      {/* CALIBRATION */}
      {activeTab === 'CALIBRATION' && (
        <div className="space-y-5">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">📐 Confidence Calibration — How Well-Calibrated Are We?</span>

          {/* Calibration metrics header */}
          {calibration && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[8px] font-mono">
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">Brier Score</div>
                <div className={`text-lg font-bold font-mono mt-1 ${calibration.brierScore < 0.10 ? 'text-emerald-400' : calibration.brierScore < 0.20 ? 'text-yellow-400' : 'text-red-400'}`}>{calibration.brierScore.toFixed(4)}</div>
                <div className="text-[6px] text-slate-600 mt-0.5">0=perfect, 1=worst</div>
              </div>
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">ECE</div>
                <div className={`text-lg font-bold font-mono mt-1 ${calibration.ece < 10 ? 'text-emerald-400' : calibration.ece < 20 ? 'text-yellow-400' : 'text-red-400'}`}>{calibration.ece.toFixed(1)}%</div>
                <div className="text-[6px] text-slate-600 mt-0.5">Expected Calibration Error</div>
              </div>
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">MCE</div>
                <div className={`text-lg font-bold font-mono mt-1 ${calibration.mce < 20 ? 'text-emerald-400' : calibration.mce < 30 ? 'text-yellow-400' : 'text-red-400'}`}>{calibration.mce.toFixed(1)}%</div>
                <div className="text-[6px] text-slate-600 mt-0.5">Max Calibration Error</div>
              </div>
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">Quality</div>
                <div className={`text-lg font-bold font-mono mt-1 ${
                  calibration.calibrationQuality === 'EXCELLENT' ? 'text-emerald-400' :
                  calibration.calibrationQuality === 'GOOD' ? 'text-blue-400' :
                  calibration.calibrationQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'
                }`}>{calibration.calibrationQuality}</div>
              </div>
            </div>
          )}

          {/* Reliability diagram */}
          {calibration && calibration.bins.length > 0 && (
            <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">Reliability Diagram</div>
              <div className="space-y-2">
                {calibration.bins.map((bin, i) => {
                  const overconfident = bin.accuracy < bin.avgConfidence;
                  const gap = Math.abs(bin.accuracy - bin.avgConfidence);
                  return (
                    <div key={i} className="flex items-center gap-3 text-[8px] font-mono">
                      <span className="text-slate-500 w-16 shrink-0">{bin.binStart.toFixed(0)}-{bin.binEnd.toFixed(0)}%</span>
                      <div className="flex-1 relative h-5">
                        <div className="absolute inset-0 bg-slate-800 rounded-full" />
                        <div className="absolute inset-y-0 left-0 bg-emerald-500/40 rounded-full transition-all duration-700"
                          style={{ width: `${bin.accuracy}%` }} />
                        {overconfident && (
                          <div className="absolute inset-y-0 left-0 bg-red-500/30 rounded-full transition-all duration-700"
                            style={{ width: `${bin.avgConfidence}%` }} />
                        )}
                        <div className="absolute top-0 left-0 h-full border-r-2 border-white/30"
                          style={{ left: `${bin.avgConfidence}%` }}>
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[6px] text-white font-bold whitespace-nowrap">
                            prediction: {bin.avgConfidence.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <span className={`font-bold w-14 text-right ${bin.accuracy >= 70 ? 'text-emerald-400' : bin.accuracy >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {bin.accuracy.toFixed(0)}%
                      </span>
                      <span className="text-slate-600 w-6 text-right">{bin.count}</span>
                      <span className={`w-10 text-right ${overconfident ? 'text-red-400' : 'text-emerald-400'}`}>
                        {overconfident ? '↑' : '↓'}{gap.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 p-2 bg-slate-950/40 rounded-lg text-[7px] font-mono text-slate-500 border border-slate-800/50">
                Each row shows a confidence bin. The bar shows actual accuracy. The marker shows average predicted confidence. 
                When prediction exceeds accuracy, the model is overconfident (↑). Green bars = well-calibrated.
              </div>
            </div>
          )}

          {/* Overconfidence / Underconfidence summary */}
          {calibration && (
            <div className="grid grid-cols-2 gap-3 text-[8px] font-mono">
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">Overconfidence</div>
                <div className={`text-lg font-bold font-mono mt-1 ${calibration.overconfidence < 10 ? 'text-emerald-400' : 'text-red-400'}`}>{calibration.overconfidence.toFixed(1)}%</div>
                <div className="text-[6px] text-slate-600 mt-0.5">Avg confidence exceeds accuracy</div>
              </div>
              <div className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 text-center">
                <div className="text-[7px] uppercase font-bold text-slate-500 tracking-wider">Underconfidence</div>
                <div className={`text-lg font-bold font-mono mt-1 ${calibration.underconfidence < 10 ? 'text-emerald-400' : 'text-yellow-400'}`}>{calibration.underconfidence.toFixed(1)}%</div>
                <div className="text-[6px] text-slate-600 mt-0.5">Accuracy exceeds confidence</div>
              </div>
            </div>
          )}

          {/* A/B Comparison */}
          <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">🤖 ML vs Rule-Based — A/B Comparison</div>
            {abTest ? (
              <div className="space-y-3 text-[8px] font-mono">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">ML Return</div>
                    <div className={`text-lg font-bold font-mono ${abTest.mlPerformance.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {abTest.mlPerformance.totalReturnPct >= 0 ? '+' : ''}{abTest.mlPerformance.totalReturnPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Rule Return</div>
                    <div className={`text-lg font-bold font-mono ${abTest.ruleBasedPerformance.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {abTest.ruleBasedPerformance.totalReturnPct >= 0 ? '+' : ''}{abTest.ruleBasedPerformance.totalReturnPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                  <span className="text-slate-400">ML Better?</span>
                  <span className={`font-bold ${abTest.mlBetter ? 'text-emerald-400' : 'text-red-400'}`}>{abTest.mlBetter ? '✅ Yes' : '❌ No'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                  <span className="text-slate-400">Win Rate Diff</span>
                  <span className={`font-bold ${abTest.mlWinRateDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{abTest.mlWinRateDiff >= 0 ? '+' : ''}{abTest.mlWinRateDiff.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                  <span className="text-slate-400">Return Diff</span>
                  <span className={`font-bold ${abTest.mlReturnDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{abTest.mlReturnDiff >= 0 ? '+' : ''}{abTest.mlReturnDiff.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
                  <span className="text-slate-400">Significance</span>
                  <span className={`font-bold ${abTest.significance > 95 ? 'text-emerald-400' : abTest.significance > 80 ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {abTest.significance.toFixed(1)}% {abTest.significance > 95 ? '(significant)' : '(not significant)'}
                  </span>
                </div>
                <div className="text-[7px] text-slate-600 mt-2 p-2 bg-slate-950/30 rounded-lg border border-slate-800/40">
                  ML: {abTest.mlPerformance.totalTrades} trades, {abTest.mlPerformance.winRate.toFixed(0)}% win rate, Sharpe {abTest.mlPerformance.sharpeRatio.toFixed(2)} |
                  Rule: {abTest.ruleBasedPerformance.totalTrades} trades, {abTest.ruleBasedPerformance.winRate.toFixed(0)}% win rate
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-[10px] text-slate-500 font-mono">
                No historical data available for A/B comparison
              </div>
            )}
          </div>

          {/* Walk-Forward Backtest Results */}
          <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📈 Walk-Forward Backtest — Transaction Costs Included</div>
            {backtest && backtest.totalTrades > 0 ? (
              <div className="space-y-3 text-[8px] font-mono">
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Total Trades</div>
                    <div className="text-lg font-bold font-mono text-white">{backtest.totalTrades}</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Win Rate</div>
                    <div className={`text-lg font-bold font-mono ${backtest.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtest.winRate.toFixed(1)}%</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Total Return</div>
                    <div className={`text-lg font-bold font-mono ${backtest.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{backtest.totalReturnPct >= 0 ? '+' : ''}{backtest.totalReturnPct.toFixed(1)}%</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Max DD</div>
                    <div className="text-lg font-bold font-mono text-red-400">{backtest.maxDrawdown.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Sharpe</div>
                    <div className={`text-lg font-bold font-mono ${backtest.sharpeRatio >= 1 ? 'text-emerald-400' : 'text-yellow-400'}`}>{backtest.sharpeRatio.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Profit Factor</div>
                    <div className={`text-lg font-bold font-mono ${backtest.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-yellow-400'}`}>{backtest.profitFactor.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Avg Win</div>
                    <div className="text-lg font-bold font-mono text-emerald-400">{backtest.avgWin.toFixed(1)}%</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800/50">
                    <div className="text-slate-500">Avg Loss</div>
                    <div className="text-lg font-bold font-mono text-red-400">{backtest.avgLoss.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="text-[7px] text-slate-600 mt-2 p-2 bg-slate-950/30 rounded-lg border border-slate-800/40">
                  Walk-forward with {Math.floor(backtest.totalTrades / 10)} windows, 0.1% transaction cost per side, 25% position sizing. 
                  Stop-loss: 5%, take-profit: 10%, max hold: 10 bars.
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-[10px] text-slate-500 font-mono">
                Not enough historical data for backtest (need 120+ daily candles).
              </div>
            )}
          </div>

          {!calibration && !backtest && (
            <div className="text-center py-16 border border-slate-800 rounded-2xl">
              <div className="text-3xl mb-2">📐</div>
              <p className="text-[10px] text-slate-500 font-mono">No data available for calibration analysis. Predictions need to be generated and resolved first.</p>
            </div>
          )}
        </div>
      )}

      {/* FAILURE ANALYSIS */}
      {activeTab === 'ANALYSIS' && (
        <div className="space-y-4">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">🔬 AI Failure Analysis — Learning from Mistakes</span>

          {(() => {
            const failed = resolvedPreds.filter(p => p.result === 'WRONG' && p.failureAnalysis);
            if (failed.length === 0) {
              return (
                <div className="text-center py-16 border border-slate-800 rounded-2xl">
                  <div className="text-3xl mb-2">🎯</div>
                  <p className="text-[10px] text-slate-500 font-mono">No failed predictions yet — or all failures have been analyzed.</p>
                </div>
              );
            }

            // Aggregate failure reasons
            const reasonCounts: Record<string, number> = {};
            for (const p of failed) {
              if (p.failureAnalysis) {
                reasonCounts[p.failureAnalysis.primaryReason] = (reasonCounts[p.failureAnalysis.primaryReason] || 0) + 1;
                for (const r of p.failureAnalysis.secondaryReasons) {
                  reasonCounts[r] = (reasonCounts[r] || 0) + 1;
                }
              }
            }
            const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

            return (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-4">Failure Reason Breakdown</div>
                    <div className="space-y-2">
                      {topReasons.map(([reason, count]) => {
                        const maxCount = topReasons[0][1];
                        return (
                          <div key={reason} className="flex items-center gap-2 text-[8px] font-mono">
                            <span className="text-slate-400 flex-1 truncate">{reason}</span>
                            <div className="w-24 bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-red-500 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-slate-500 w-4 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-4">Failure Pattern Tags</div>
                    <div className="space-y-2 text-[8px] font-mono">
                      {(() => {
                        const tagCounts: Record<string, number> = {
                          'Volatility Spike': failed.filter(p => p.failureAnalysis?.volatilitySpike).length,
                          'Regime Change': failed.filter(p => p.failureAnalysis?.regimeChange).length,
                          'Momentum Failure': failed.filter(p => p.failureAnalysis?.momentumFailure).length,
                          'Institutional Selling': failed.filter(p => p.failureAnalysis?.institutionalSelling).length,
                          'Earnings Impact': failed.filter(p => p.failureAnalysis?.earningsImpact).length,
                          'News Event': failed.filter(p => p.failureAnalysis?.newsEvent).length,
                          'Resistance Rejection': failed.filter(p => p.failureAnalysis?.resistanceRejection).length,
                          'Low Liquidity': failed.filter(p => p.failureAnalysis?.lowLiquidity).length,
                        };
                        return Object.entries(tagCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                          <div key={tag} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-950/40 border border-slate-800/50">
                            <span className="text-slate-300">{tag}</span>
                            <span className="font-bold text-white">{count}x</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Recent failure detail cards */}
                <div className="space-y-2">
                  <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest font-mono">Recent Failures — Detailed AI Reports</div>
                  {failed.sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)).slice(0, 10).map(p => (
                    <div key={p.id} className="border border-red-900/30 bg-red-950/10 rounded-xl p-4 text-[8px] font-mono">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-bold text-[10px]">{p.ticker}</span>
                        <span className="text-red-400">❌ WRONG</span>
                        <span className="text-slate-500">Confidence: {p.confidence}% | Direction: {p.direction}</span>
                        <span className="text-slate-600">Entry ${p.entryPrice.toFixed(2)} → Actual ${p.actualPrice?.toFixed(2)}</span>
                      </div>
                      {p.failureAnalysis && (
                        <>
                          <div className="bg-slate-950/40 rounded-lg p-3 border-l-2 border-red-500/50 mb-2">
                            <div className="text-[8px] font-bold text-red-400 mb-1">🧠 AI Explanation:</div>
                            <p className="text-[9px] text-slate-300 leading-relaxed">{p.failureAnalysis.detail}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {p.failureAnalysis.volatilitySpike && <span className="bg-red-500/15 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded">⚡ Volatility Spike</span>}
                            {p.failureAnalysis.regimeChange && <span className="bg-purple-500/15 text-purple-400 border border-purple-900/40 px-1.5 py-0.5 rounded">🔄 Regime Change</span>}
                            {p.failureAnalysis.momentumFailure && <span className="bg-orange-500/15 text-orange-400 border border-orange-900/40 px-1.5 py-0.5 rounded">📉 Momentum Failure</span>}
                            {p.failureAnalysis.institutionalSelling && <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-900/40 px-1.5 py-0.5 rounded">🏛️ Institutional Selling</span>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* SECTOR ACCURACY */}
      {activeTab === 'SECTORS' && metrics && (
        <div className="space-y-4">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">🏢 Sector-Wise Accuracy — Stock-Level Breakdown</span>

          <div className="grid grid-cols-1 gap-2">
            {Object.entries(metrics.sectorAccuracy)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([ticker, stats]) => {
                const isBest = metrics.bestSectors.includes(ticker);
                const isWorst = metrics.weakestSectors.includes(ticker);
                return (
                  <div key={ticker} className="border border-slate-800 bg-slate-900/20 rounded-xl px-4 py-3 hover:border-slate-700/60 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold font-mono text-white">{ticker}</span>
                        {isBest && <span className="text-[7px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">🏆 BEST</span>}
                        {isWorst && <span className="text-[7px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30">⚠️ WEAKEST</span>}
                        <span className="text-[7px] text-slate-600">{stats.total} predictions</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${stats.accuracy >= 70 ? 'bg-emerald-500' : stats.accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${stats.accuracy}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold font-mono w-12 text-right ${stats.accuracy >= 70 ? 'text-emerald-400' : stats.accuracy >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {stats.accuracy.toFixed(0)}%
                        </span>
                        <div className="flex text-[7px] gap-1">
                          <span className="text-emerald-400">{stats.correct}✓</span>
                          <span className="text-red-400">{stats.total - stats.correct}✗</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {Object.keys(metrics.sectorAccuracy).length === 0 && (
            <div className="text-center py-10 border border-slate-800 rounded-2xl">
              <p className="text-[10px] text-slate-500 font-mono">No sector data available yet.</p>
            </div>
          )}
        </div>
      )}

      {/* LEARNING */}
      {activeTab === 'LEARNING' && (() => {
        const snapshot = getAILearningSnapshot();
        const weights = getAIIndicatorWeights();
        const indicatorPerf = getAIIndicatorPerformance();
        const failurePatterns = getAIFailurePatterns();
        const perfEntries = Object.entries(indicatorPerf).filter(([, r]) => r.totalOccurrences >= 2).sort((a, b) => b[1].accuracy - a[1].accuracy);
        const failEntries = Object.entries(failurePatterns).sort((a, b) => b[1].totalOccurrences - a[1].totalOccurrences).slice(0, 6);

        return (
          <div className="space-y-4">
            {snapshot.totalResolvedPredictions > 0 && (
              <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-4">
                <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">🧠 AI Learning State</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[8px] font-mono">
                  <div className="bg-slate-950/40 rounded-lg p-2 text-center border border-slate-800/40">
                    <span className="text-slate-500 block">Analyzed</span>
                    <span className="text-white font-bold">{snapshot.totalPredictionsAnalyzed}</span>
                  </div>
                  <div className="bg-slate-950/40 rounded-lg p-2 text-center border border-slate-800/40">
                    <span className="text-slate-500 block">Resolved</span>
                    <span className="text-white font-bold">{snapshot.totalResolvedPredictions}</span>
                  </div>
                  <div className="bg-slate-950/40 rounded-lg p-2 text-center border border-slate-800/40">
                    <span className="text-slate-500 block">Calibration</span>
                    <span className={`font-bold ${snapshot.calibrationQuality === 'EXCELLENT' ? 'text-emerald-400' : snapshot.calibrationQuality === 'GOOD' ? 'text-green-400' : snapshot.calibrationQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'}`}>{snapshot.calibrationQuality}</span>
                  </div>
                  <div className="bg-slate-950/40 rounded-lg p-2 text-center border border-slate-800/40">
                    <span className="text-slate-500 block">Best Indicator</span>
                    <span className="text-emerald-400 font-bold">{snapshot.strongestIndicator || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {perfEntries.length > 0 && (
              <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-4">
                <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">📊 Learned Indicator Accuracy</div>
                <div className="space-y-1">
                  {perfEntries.slice(0, 8).map(([name, r]) => (
                    <div key={name} className="flex items-center gap-2 text-[8px] font-mono">
                      <span className="text-slate-400 w-14 shrink-0">{name}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${r.accuracy >= 70 ? 'bg-emerald-500' : r.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${r.accuracy}%` }} />
                      </div>
                      <span className="text-white font-bold w-7 text-right">{r.accuracy.toFixed(0)}%</span>
                      <span className="text-slate-600 w-10 text-right">({r.totalOccurrences}x)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-4">
                <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">⚖️ Adaptive Weights</div>
                <div className="grid grid-cols-2 gap-1.5 text-[8px] font-mono">
                  {Object.entries(weights.weights).map(([ind, w]) => (
                    <div key={ind} className="flex justify-between bg-slate-950/40 rounded px-2 py-1 border border-slate-800/40">
                      <span className="text-slate-400">{ind.charAt(0).toUpperCase() + ind.slice(1)}</span>
                      <span className={`font-bold ${w > 1.1 ? 'text-emerald-400' : w < 0.9 ? 'text-red-400' : 'text-white'}`}>{w.toFixed(2)}x</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-4">
                <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">⚠️ Failure Patterns</div>
                {failEntries.length > 0 ? (
                  <div className="space-y-1">
                    {failEntries.map(([, fp], i) => (
                      <div key={i} className="bg-slate-950/40 rounded-lg p-2 border border-slate-800/40 text-[7px] font-mono">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-slate-300 font-bold truncate max-w-[180px]">{fp.patternName}</span>
                          <span className={`text-[6px] font-bold px-1 py-0.5 rounded ${fp.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : fp.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' : fp.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'}`}>{fp.severity}</span>
                        </div>
                        <span className="text-slate-600">{fp.totalOccurrences}x · {fp.repeatRate.toFixed(0)}% repeat</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[8px] text-slate-500 font-mono text-center py-4">No failure patterns yet</div>
                )}
              </div>
            </div>

            {snapshot.totalResolvedPredictions === 0 && (
              <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-6 text-center">
                <div className="text-[10px] font-mono text-slate-500">AI learning engine is waiting for resolved predictions.</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Prediction Comparison Popup */}
      {selectedPred && selectedPred.resolved && selectedPred.actualPrice && (
        <div className="fixed bottom-4 right-4 w-80 border border-slate-700 bg-slate-900 rounded-2xl p-4 shadow-2xl z-50 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold font-mono text-white">{selectedPred.ticker} — Prediction vs Reality</span>
            <button onClick={() => setSelectedPred(null)} className="text-slate-500 hover:text-white text-[10px]">✕</button>
          </div>
          <div className="space-y-2 text-[8px] font-mono">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-950/50 rounded-lg p-2">
                <div className="text-slate-500">Entry</div>
                <div className="text-white font-bold">${selectedPred.entryPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-2">
                <div className="text-slate-500">Predicted</div>
                <div className={`font-bold ${(selectedPred.targetPrice - selectedPred.entryPrice) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${selectedPred.targetPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-2">
                <div className="text-slate-500">Actual</div>
                <div className={`font-bold ${(selectedPred.actualPrice - selectedPred.entryPrice) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${selectedPred.actualPrice.toFixed(2)}</div>
              </div>
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <span className="text-slate-500">Deviation: </span>
              <span className={`font-bold ${(selectedPred.deviationPercent || 0) <= 20 ? 'text-emerald-400' : (selectedPred.deviationPercent || 0) <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                {selectedPred.deviationPercent?.toFixed(1)}%
              </span>
              <span className="text-slate-500 ml-2">Accuracy: </span>
              <span className={`font-bold ${(selectedPred.accuracyPercent || 0) >= 70 ? 'text-emerald-400' : (selectedPred.accuracyPercent || 0) >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                {selectedPred.accuracyPercent?.toFixed(0)}%
              </span>
            </div>
            <StatusBadge result={selectedPred.result} />
          </div>
        </div>
      )}
    </div>
  );
}
