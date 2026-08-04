'use client';

import { useEffect, useState } from 'react';

type AccuracyPayload = {
  ok: boolean;
  rolling?: {
    winRate: number;
    resolvedPredictions: number;
    totalPredictions: number;
    avgAccuracy: number;
    sharpeRatio: number;
  };
  engineSelfAwareness?: {
    overallAccuracy: number;
    selfAwarenessScore: number;
    trend: string;
  };
  supabaseReachable?: boolean;
};

export default function AccuracySnapshot() {
  const [data, setData] = useState<AccuracyPayload | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch('/api/accuracy?days=90', { cache: 'no-store' })
        .then(r => r.json())
        .then((d: AccuracyPayload) => { if (active) setData(d); })
        .catch(() => { if (active) setData(null); });
    };
    load();
    const id = setInterval(load, 120_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const winRate = data?.rolling?.winRate ?? data?.engineSelfAwareness?.overallAccuracy ?? 0;
  const resolved = data?.rolling?.resolvedPredictions ?? 0;
  const total = data?.rolling?.totalPredictions ?? 0;
  const trend = data?.engineSelfAwareness?.trend ?? 'STABLE';
  const color = winRate >= 55 ? 'text-emerald-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="terminal-card p-5 col-span-1 flex flex-col h-full">
      <div className="text-sm font-medium text-slate-400 tracking-wide mb-1">AI Accuracy</div>
      <div className="flex items-baseline gap-2 mt-2">
        <div className={`text-2xl font-semibold tracking-tight ${color}`}>
          {data ? `${winRate.toFixed(1)}%` : '—'}
        </div>
        <div className="text-sm font-medium text-slate-500">{trend}</div>
      </div>
      <p className="text-sm text-slate-500 font-medium mt-auto pt-2 border-t border-slate-700/50">
        {data
          ? `${resolved} resolved / ${total} tracked (90d)`
          : 'Loading validation stats…'}
      </p>
    </div>
  );
}
