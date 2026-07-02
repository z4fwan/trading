'use client';

import { useMemo, useState, useEffect } from 'react';
import type { TrustMetrics } from '@/lib/predictionStore';
import type { RollingStats } from '@/lib/predictionValidation';
import type { CalibrationMetrics } from '@/lib/calibrationEngine';

interface Props {
  trustMetrics: TrustMetrics | null;
  calibration: CalibrationMetrics | null;
  rollingStats?: RollingStats;
  regimeAccuracy?: Record<string, { total: number; correct: number; accuracy: number }>;
}

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3">
      <div className="text-[7px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">{label}</div>
      <div className={`text-sm font-bold font-mono ${color || 'text-white'}`}>{value}</div>
      {sub && <div className="text-[6px] text-slate-600 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AIValidationPanel({ trustMetrics, calibration, rollingStats }: Props) {
  const [liveStats, setLiveStats] = useState<RollingStats | null>(rollingStats || null);
  const [regimeAcc, setRegimeAcc] = useState<Record<string, { total: number; correct: number; accuracy: number }> | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/accuracy?days=90', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!active || !d.ok) return;
        if (!rollingStats && d.rolling) setLiveStats(d.rolling);
        if (d.regimeAccuracy) setRegimeAcc(d.regimeAccuracy);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [rollingStats]);

  const cs = useMemo(() => {
    if (!calibration || !calibration.bins.length) return null;
    return calibration.bins.filter(b => b.count >= 2);
  }, [calibration]);

  const stats = liveStats || rollingStats;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">Validation Dashboard</div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="Total Preds" value={trustMetrics?.totalPredictions ?? stats?.totalPredictions ?? 0} />
        <StatBox label="Win Rate" value={`${stats?.winRate ?? trustMetrics?.avgAccuracy ?? 0}%`} color="text-emerald-400" sub={`${stats?.resolvedPredictions ?? 0} resolved`} />
        <StatBox label="Sharpe" value={stats?.sharpeRatio ?? '—'} color={(stats?.sharpeRatio ?? 0) > 1 ? 'text-emerald-400' : 'text-yellow-400'} />
        <StatBox label="Max DD" value={stats?.maxDrawdown ? `${stats.maxDrawdown}%` : '—'} color="text-red-400" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="Avg Confidence" value={`${trustMetrics?.avgConfidence ?? stats?.avgConfidence ?? 0}%`} />
        <StatBox label="Avg Accuracy" value={`${trustMetrics?.avgAccuracy ?? stats?.avgAccuracy ?? 0}%`} color="text-emerald-400" />
        <StatBox label="Precision" value={stats?.precision ? `${stats.precision}%` : '—'} color="text-blue-400" />
        <StatBox label="F1 Score" value={stats?.f1Score ? `${stats.f1Score}%` : '—'} color="text-purple-400" />
      </div>

      {/* Trust Score */}
      {trustMetrics && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">Trust Score</span>
            <span className={`text-xs font-bold font-mono ${trustMetrics.trustScore >= 60 ? 'text-emerald-400' : trustMetrics.trustScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {trustMetrics.trustScore}/100
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${trustMetrics.trustScore >= 60 ? 'bg-emerald-500' : trustMetrics.trustScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${trustMetrics.trustScore}%` }} />
          </div>
          <div className="flex justify-between text-[6px] text-slate-600 font-mono mt-1">
            <span>Trend: {trustMetrics.trend}</span>
            <span>Gap: {trustMetrics.confidenceAccuracyGap}%</span>
            <span>Reliability: {trustMetrics.confidenceReliability}%</span>
          </div>
        </div>
      )}

      {/* Calibration Bins */}
      {cs && cs.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">
            Confidence Calibration
            <span className={`ml-2 text-[7px] ${calibration?.calibrationQuality === 'EXCELLENT' ? 'text-emerald-400' : calibration?.calibrationQuality === 'GOOD' ? 'text-blue-400' : calibration?.calibrationQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'}`}>
              {calibration?.calibrationQuality}
            </span>
          </div>
          <div className="space-y-1">
            {cs.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[7px] font-mono">
                <span className="w-16 text-slate-500">{b.binStart}-{b.binEnd}%</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${b.accuracy}%` }} />
                </div>
                <span className="w-10 text-right text-slate-400">{b.accuracy}%</span>
                <span className={`w-8 text-right ${b.gap > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {b.gap > 0 ? '+' : ''}{b.gap}%
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[6px] text-slate-600 font-mono mt-2">
            <span>ECE: {calibration?.ece}%</span>
            <span>MCE: {calibration?.mce}%</span>
            <span>Brier: {calibration?.brierScore}</span>
            <span>Over: {calibration?.overconfidence}%</span>
          </div>
        </div>
      )}

      {/* Regime-specific accuracy */}
      {regimeAcc && Object.keys(regimeAcc).length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-2">Regime Accuracy</div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(regimeAcc).sort((a, b) => b[1].accuracy - a[1].accuracy).map(([regime, info]) => (
              <div key={regime} className="bg-slate-950/30 rounded-lg p-1.5 flex justify-between items-center text-[7px] font-mono">
                <span className="text-slate-400">{regime.replace(/_/g, ' ')}</span>
                <span className={info.accuracy >= 60 ? 'text-emerald-400' : 'text-red-400'}>{info.accuracy}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
