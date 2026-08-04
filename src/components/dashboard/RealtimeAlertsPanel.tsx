'use client';
import { useMarketData } from '@/lib/MarketDataContext';

export default function RealtimeAlertsPanel() {
  const { alerts } = useMarketData();
  const list = Array.isArray(alerts) ? alerts : [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Live AI Predictions</span>
        <span className="ml-auto font-mono text-[10px] text-slate-500">{list.length} signals</span>
      </div>
      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {list.length === 0 ? (
          <p className="py-2 text-center font-mono text-[11px] text-slate-600">
            Waiting for live signals — scanner armed on every quote tick...
          </p>
        ) : (
          list.slice(0, 8).map((a) => {
            const bull = a.direction === 'BULLISH';
            const timeStr = a.ts ? new Date(a.ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '--:--:--';
            return (
              <div key={a.id || Math.random()} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`font-mono font-bold ${bull ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {bull ? '▲' : '▼'} {a.ticker}
                  </span>
                  <span className={`${bull ? 'text-emerald-400' : 'text-rose-400'}`}>{a.direction} {a.confidence}%</span>
                  <span className="truncate text-slate-500">{String(a.trigger || '').replace(/_/g, ' ')}</span>
                </div>
                <span className="shrink-0 font-mono text-slate-500">
                  {typeof a.price === 'number' ? '₹' + a.price.toFixed(2) : ''} · {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
