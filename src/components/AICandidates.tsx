'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { getAllPredictions, type StoredPrediction } from '@/lib/predictionStore';

export default function AICandidates() {
  const [filterSource, setFilterSource] = useState<string>('AI_QUANT');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'createdAt'>('createdAt');
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const predictions = useMemo(() => {
    const all = getAllPredictions()
      .filter(p => {
        if (filterSource !== 'all' && p.source !== filterSource) return false;
        if (filterType !== 'all' && p.predictionType !== filterType) return false;
        return (Date.now() - p.createdAt) < 7 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => sortBy === 'createdAt' ? b.createdAt - a.createdAt : b.confidence - a.confidence);
    return all;
  }, [filterSource, filterType, sortBy, refreshTick]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const p of getAllPredictions()) set.add(p.source);
    return ['all', ...Array.from(set)];
  }, [refreshTick]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const p of getAllPredictions()) set.add(p.predictionType);
    return ['all', ...Array.from(set)];
  }, [refreshTick]);

  const [triggerMsg, setTriggerMsg] = useState('');
  const triggerAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setTriggerMsg('');
    try {
      const res = await fetch('/api/ai-analyze', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTriggerMsg(`Analyzed ${data.analyzed} stocks`);
        if (data.analyzed > 0) setTimeout(() => setRefreshTick(t => t + 1), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setTriggerMsg(err.error || 'Server error');
      }
    } catch {
      setTriggerMsg('Network error');
    }
    setTimeout(() => { setAnalyzing(false); setTimeout(() => setTriggerMsg(''), 5000); }, 2000);
  }, []);

  if (predictions.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-slate-500 font-mono text-sm mb-4">No AI candidate predictions yet.</div>
        <button type="button" onClick={triggerAnalysis} disabled={analyzing}
          className="px-4 py-2 text-xs font-mono font-bold rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all disabled:opacity-50">
          {analyzing ? 'Triggering...' : 'Trigger AI Analysis Now'}
        </button>
        {triggerMsg && <div className="text-[9px] font-mono text-slate-500 mt-2">{triggerMsg}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-0.5">
          {sources.map(s => (
            <button key={s} type="button" onClick={() => setFilterSource(s)}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-md transition-all ${
                filterSource === s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-white'
              }`}>
              {s === 'all' ? 'ALL' : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-0.5">
          {types.map(t => (
            <button key={t} type="button" onClick={() => setFilterType(t)}
              className={`px-2 py-1 text-[9px] font-mono font-bold rounded-md transition-all ${
                filterType === t
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-white'
              }`}>
              {t === 'all' ? 'ALL' : t}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setSortBy(s => s === 'createdAt' ? 'confidence' : 'createdAt')}
          className="px-2.5 py-1 text-[10px] font-mono rounded-lg border border-slate-700/50 text-slate-400 hover:text-white transition-all">
          Sort: {sortBy === 'createdAt' ? 'Newest' : 'Confidence'}
        </button>
        <button type="button" onClick={triggerAnalysis} disabled={analyzing}
          className="px-2.5 py-1 text-[10px] font-mono rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-50">
          {analyzing ? 'Analyzing...' : '+ Analyze'}
        </button>
        {triggerMsg && <span className="text-[9px] font-mono text-slate-500">{triggerMsg}</span>}
        <span className="text-[10px] font-mono text-slate-600 ml-auto">{predictions.length} candidates</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {predictions.map(p => (
          <PredictionCard key={`${p.id}-${p.createdAt}`} prediction={p} />
        ))}
      </div>
    </div>
  );
}

function PredictionCard({ prediction: p }: { prediction: StoredPrediction }) {
  const [expanded, setExpanded] = useState(false);

  const isBullish = p.direction === 'BULLISH';
  const timeAgo = formatTimeAgo(p.createdAt);
  const pnl = p.entryPrice > 0 ? ((p.targetPrice - p.entryPrice) / p.entryPrice * 100) : 0;
  const isExpired = Date.now() > new Date(p.expiryDate).getTime();

  let statusLabel: string;
  let statusColor: string;
  if (p.resolved && p.result === 'CORRECT') { statusLabel = '✓ CORRECT'; statusColor = 'text-emerald-400'; }
  else if (p.resolved && p.result === 'WRONG') { statusLabel = '✗ WRONG'; statusColor = 'text-red-400'; }
  else if (p.resolved && p.result === 'PARTIAL') { statusLabel = '~ PARTIAL'; statusColor = 'text-yellow-400'; }
  else if (isExpired) { statusLabel = '⌛ EXPIRED'; statusColor = 'text-slate-500'; }
  else { statusLabel = '● PENDING'; statusColor = 'text-blue-400'; }

  const actualPnl = p.actualPrice && p.entryPrice
    ? ((p.actualPrice - p.entryPrice) / p.entryPrice * 100)
    : null;

  return (
    <div className={`bg-slate-900/80 border rounded-lg p-3 transition-all ${
      isBullish ? 'border-emerald-900/40 hover:border-emerald-700/50' : 'border-red-900/40 hover:border-red-700/50'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold font-mono ${isBullish ? 'text-emerald-400' : 'text-red-400'}`}>
              {isBullish ? '▲' : '▼'} {p.ticker}
            </span>
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${statusColor} bg-slate-800`}>{statusLabel}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">{p.name} · {p.source} · {p.predictionType}</div>
        </div>
        <div className="text-right">
          <div className={`text-[11px] font-bold font-mono ${isBullish ? 'text-emerald-400' : 'text-red-400'}`}>
            {p.confidence}%
          </div>
          <div className="text-[8px] font-mono text-slate-600">{timeAgo}</div>
          {p.llmProvider && <div className="text-[7px] font-mono text-slate-600">{p.llmProvider}</div>}
        </div>
      </div>

      <div className="flex gap-3 text-[10px] font-mono mb-2">
        <div><span className="text-slate-500">Entry</span> <span className="text-white">{p.entryPrice.toFixed(2)}</span></div>
        <div><span className="text-emerald-400">Target</span> <span className="text-white">{p.targetPrice.toFixed(2)}</span></div>
        {p.stopLoss && <div><span className="text-red-400">Stop</span> <span className="text-white">{p.stopLoss.toFixed(2)}</span></div>}
        <div className={`${isBullish ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBullish ? '+' : ''}{pnl.toFixed(1)}%
        </div>
      </div>

      {p.resolved && actualPnl !== null && (
        <div className={`text-[9px] font-mono mb-1 ${actualPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          Actual: {actualPnl >= 0 ? '+' : ''}{actualPnl.toFixed(2)}% @ {p.actualPrice?.toFixed(2) || '—'}
        </div>
      )}

      {p.reasoning.length > 0 && (
        <>
          <button type="button" onClick={() => setExpanded(e => !e)}
            className="text-[8px] font-mono text-slate-600 hover:text-slate-400 transition-colors">
            {expanded ? '▲ Hide' : '▼ Show'} reasoning ({p.reasoning.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {p.reasoning.map((r, i) => (
                <div key={i} className="text-[8px] font-mono text-slate-400 bg-slate-950/50 rounded px-2 py-1">{r}</div>
              ))}
            </div>
          )}
        </>
      )}

      {p.taSnapshot && (
        <div className="flex gap-2 mt-2 text-[7px] font-mono text-slate-600 border-t border-slate-800/50 pt-2">
          <span>RSI {p.taSnapshot.rsi.toFixed(0)}</span>
          <span>ADX {p.taSnapshot.adx.toFixed(0)}</span>
          <span className={p.taSnapshot.supertrendDirection === 'up' ? 'text-emerald-400/60' : 'text-red-400/60'}>
            {p.taSnapshot.supertrendDirection.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
