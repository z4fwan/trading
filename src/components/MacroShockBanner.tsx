'use client';
import { useMacroShock, dismissMacroShock, type MacroShockEvent } from '@/lib/macroInterruptHandler';
import { TerminalIcon } from '@/components/icons/TerminalIcons';

const severityColor = (regime: string) =>
  regime === 'PANIC' ? 'from-red-600/95 via-red-500/85 to-red-700/95' :
  'from-orange-600/95 via-orange-500/85 to-orange-700/95';

const severityGlow = (regime: string) =>
  regime === 'PANIC' ? 'shadow-[0_0_30px_rgba(220,38,38,0.5)]' :
  'shadow-[0_0_30px_rgba(234,88,12,0.4)]';

function ShockDetails({ event }: { event: MacroShockEvent }) {
  return (
    <div className="text-[10px] font-mono text-red-100/80 mt-2 leading-relaxed max-w-4xl">
      <span className="font-bold text-red-200">Impacting: </span>
      {event.impacts.flatMap(i => i.sectors).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
      <span className="ml-3 font-bold text-red-200">Tickers: </span>
      {event.bullishTickers.join(', ')}
      {event.safeHavenTickers.length > 0 && (
        <><span className="ml-3 font-bold text-amber-300">Safe Havens: </span>{event.safeHavenTickers.join(', ')}</>
      )}
    </div>
  );
}

function formatNewsAge(newsPublishedAt: number): string {
  const mins = Math.floor((Date.now() - newsPublishedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function MacroShockBanner() {
  const shock = useMacroShock();

  if (!shock || !shock.active) return null;

  const isPanic = shock.forcedRegime === 'PANIC';
  const newsAge = formatNewsAge(shock.newsPublishedAt);

  return (
    <div
      role="alert"
      className={`relative z-20 mb-3 sm:mb-4 rounded-xl overflow-hidden bg-linear-to-r ${severityColor(shock.forcedRegime)} ${severityGlow(shock.forcedRegime)} border-2 ${isPanic ? 'border-red-400' : 'border-orange-400'}`}
    >
      <div className="px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <TerminalIcon name="alert" size={20} className="text-red-100 shrink-0 animate-pulse" />
              <span className={`text-[10px] uppercase font-bold tracking-widest font-mono ${isPanic ? 'text-red-200' : 'text-orange-200'}`}>
                Tier-1 Event Detected
              </span>
              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${isPanic ? 'bg-red-950/50 border-red-400/30 text-red-300' : 'bg-orange-950/50 border-orange-400/30 text-orange-300'}`}>
                {shock.forcedRegime}
              </span>
              {shock.region === 'INDIAN' && (
                <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border bg-orange-950/40 border-orange-400/30 text-orange-200">
                  NSE / India
                </span>
              )}
              <span className="text-[8px] font-mono text-red-200/60">{newsAge}</span>
            </div>
            <div className="mt-1.5 flex items-start gap-2">
              <span className="text-[11px] font-mono text-red-100 font-bold">[{shock.source}]</span>
              <span className="text-[11px] font-mono text-red-100/90 truncate">{shock.headline}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[8px] font-mono bg-black/30 px-2 py-0.5 rounded-full text-red-200/70 border border-red-500/20">
                VETO: {shock.vetoedTickers.join(', ')}
              </span>
              {shock.bullishTickers.length > 0 && (
                <span className="text-[8px] font-mono bg-emerald-950/40 px-2 py-0.5 rounded-full text-emerald-300/70 border border-emerald-500/20">
                  BULLISH: {shock.bullishTickers.join(', ')}
                </span>
              )}
              {shock.safeHavenTickers.length > 0 && (
                <span className="text-[8px] font-mono bg-amber-950/40 px-2 py-0.5 rounded-full text-amber-300/70 border border-amber-500/20">
                  SAFE HAVEN: {shock.safeHavenTickers.join(', ')}
                </span>
              )}
            </div>
            <ShockDetails event={shock} />
          </div>
          <button
            onClick={() => dismissMacroShock(shock.headline)}
            className="ml-4 text-red-200/50 hover:text-red-100 text-[18px] leading-none flex-shrink-0"
            title="Dismiss alert"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
