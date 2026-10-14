/**
 * Free global macro cues — no API key required.
 *
 * Uses the Yahoo v8 chart endpoint (the one feed that works from Render's
 * datacenter IPs) to read the instruments that most move Indian equities:
 * the dollar index, USD/INR, crude, US 10Y yield, gold/silver/copper.
 *
 * These are context signals for the LLM / adaptive weight engine — not trade
 * signals on their own.
 */

import { fetchChartBars } from './yahooChartClient';

export interface MacroCue {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
}

const CUE_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: 'DX-Y.NYB', label: 'US Dollar Index (DXY)' },
  { symbol: 'INR=X', label: 'USD/INR' },
  { symbol: 'CL=F', label: 'Crude Oil WTI' },
  { symbol: 'BZ=F', label: 'Brent Crude' },
  { symbol: '^TNX', label: 'US 10Y Yield' },
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'SI=F', label: 'Silver' },
  { symbol: 'HG=F', label: 'Copper' },
];

let cache: { data: Record<string, MacroCue>; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function summarize(symbol: string, label: string, bars: Awaited<ReturnType<typeof fetchChartBars>>): MacroCue {
  if (!bars || bars.length === 0) return { symbol, label, price: null, changePct: null };
  const last = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
  const changePct = prev && prev.close ? ((last.close - prev.close) / prev.close) * 100 : null;
  return {
    symbol,
    label,
    price: parseFloat(last.close.toFixed(4)),
    changePct: changePct != null ? parseFloat(changePct.toFixed(2)) : null,
  };
}

/** Fetch (and cache for 5 min) the full set of global macro cues. */
export async function fetchGlobalMacroCues(force = false): Promise<Record<string, MacroCue>> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.data;
  const out: Record<string, MacroCue> = {};
  await Promise.all(
    CUE_SYMBOLS.map(async ({ symbol, label }) => {
      try {
        const bars = await fetchChartBars(symbol, '5d', '1d', 9000);
        out[label] = summarize(symbol, label, bars);
      } catch {
        out[label] = { symbol, label, price: null, changePct: null };
      }
    }),
  );
  cache = { data: out, at: Date.now() };
  return out;
}

/** One-line human summary for Telegram / prompts (null when nothing resolved). */
export function summarizeMacroCues(cues: Record<string, MacroCue>): string | null {
  const parts: string[] = [];
  for (const cue of Object.values(cues)) {
    if (cue.price == null) continue;
    const chg = cue.changePct != null ? ` (${cue.changePct >= 0 ? '+' : ''}${cue.changePct}%)` : '';
    parts.push(`${cue.label}: ${cue.price}${chg}`);
  }
  return parts.length ? parts.join(' | ') : null;
}
