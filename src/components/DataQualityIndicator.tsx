'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { checkDataFreshness, getDataQualityScore, getDataQualityLabel, getStaleSourceCount, type DataSourceVerification } from '@/lib/dataVerificationEngine';

interface DataSourceInfo {
  name: string;
  lastUpdate: number;
}

export default function DataQualityIndicator() {
  const { lastFetchAt, connectionStatus, isLive, market } = useMarketData();
  const [expanded, setExpanded] = useState(false);

  const sources: DataSourceInfo[] = useMemo(() => [
    { name: 'Yahoo Finance (Quotes)', lastUpdate: lastFetchAt },
    { name: 'Market Status', lastUpdate: market.nse.localTime ? Date.now() : 0 },
  ], [lastFetchAt, market]);

  const verifications = useMemo(() => checkDataFreshness(sources), [sources]);
  const qualityScore = useMemo(() => getDataQualityScore(verifications), [verifications]);
  const quality = useMemo(() => getDataQualityLabel(qualityScore), [qualityScore]);
  const staleCount = useMemo(() => getStaleSourceCount(verifications), [verifications]);

  if (connectionStatus === 'disconnected') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[7px] font-mono text-red-400">NO DATA</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${
          staleCount > 0
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-emerald-500/10 border-emerald-500/20'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${staleCount > 0 ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
        <span className={`text-[7px] font-mono font-bold ${quality.color}`}>{quality.label}</span>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl z-50">
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data Quality Report</div>

          <div className="mb-2">
            <div className="flex items-center justify-between text-[8px] mb-1">
              <span className="text-slate-500 font-mono">Overall Score</span>
              <span className={`font-bold font-mono ${quality.color}`}>{qualityScore}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  qualityScore >= 70 ? 'bg-emerald-500' : qualityScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${qualityScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            {verifications.map(v => (
              <div key={v.source} className="flex items-center justify-between text-[7px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1 w-1 rounded-full ${
                    v.status === 'fresh' ? 'bg-emerald-500' :
                    v.status === 'stale' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="text-slate-400">{v.source}</span>
                </div>
                <span className={`${
                  v.status === 'fresh' ? 'text-emerald-400' :
                  v.status === 'stale' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {v.status === 'fresh' ? `${Math.round(v.age / 1000)}s ago` :
                   v.status === 'stale' ? `${Math.round(v.age / 1000)}s ago` :
                   'offline'}
                </span>
              </div>
            ))}
          </div>

          {staleCount > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-800 text-[7px] text-yellow-500 font-mono">
              ⚠ {staleCount} source(s) have stale data — predictions may be inaccurate
            </div>
          )}

          {!isLive && (
            <div className="mt-1 text-[7px] text-slate-600 font-mono">
              Market closed — prices are last known values
            </div>
          )}
        </div>
      )}
    </div>
  );
}
