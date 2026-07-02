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
    <div className="terminal-card p-3 sm:p-4 col-span-1">
      <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">AI Accuracy</div>
      <div className="flex items-baseline gap-2 mt-2">
        <div className={`text-lg sm:text-xl font-bold font-mono ${color}`}>
          {data ? `${winRate.toFixed(1)}%` : '—'}
        </div>
        <div className="text-[9px] font-mono text-slate-500">{trend}</div>
      </div>
      <p className="text-[8px] sm:text-[9px] text-slate-500 font-mono mt-1.5">
        {data
          ? `${resolved} resolved / ${total} tracked (90d)`
          : 'Loading validation stats…'}
      </p>
    </div>
  );
}
