import type { ClassifiedNewsItem } from './engineState';

/**
 * BullScore.in live-call scraper.
 *
 * bullscore.in is a Next.js SPA but the live-call cards are server-rendered in
 * the homepage HTML (ticker, BUY/SELL, entry, current, stop loss, targets,
 * analyst, timestamp). We parse that static markup into structured calls.
 *
 * Card markup (as served, after `<!-- -->` hydration comments are stripped):
 *   <h3 ...>RELIANCE</h3>
 *   <span ... bg-primary text-primary-foreground">BUY</span>      (BUY badge)
 *   <span ... bg-destructive text-destructive-foreground">SELL</span> (SELL badge)
 *   <span ...>LIVE</span> or "TARGET 1 HIT"
 *   Entry  <span ...>₹2,450</span>
 *   Current<...>₹2,455</span> <span ...>+0.20%</span>
 *   Stop Loss <span ...>₹2,420</span>
 *   Targets: ₹2,480 / ₹2,510 / ₹2,550 (three chips)
 *   <span ...>Rajesh Kumar</span>  ... 2 mins ago
 */

export interface BullScoreCall {
  ticker: string;               // Normalized, e.g. "RELIANCE" / "HDFCBANK"
  displayName: string;          // As printed, e.g. "HDFC BANK"
  direction: 'BUY' | 'SELL';
  status: string;               // "LIVE" | "TARGET 1 HIT" | ...
  entry: number;
  current: number;
  changePercent: number;        // current vs entry, signed %
  stopLoss: number;
  targets: number[];            // Source order: nearest target first (BUY ↑, SELL ↓)
  analyst: string;
  ageLabel: string;             // "2 mins ago" etc.
  ageMinutes: number;           // parsed estimate, -1 if unknown
}

// Cache the fetch so the 15-min scanner, sentiment pillar, and background
// engine don't each hammer bullscore.in.
let bullCache: { at: number; calls: BullScoreCall[] } = { at: 0, calls: [] };
const CACHE_TTL_MS = 2 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function stripComments(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

/** ₹2,450 / 2,450 → 2450; "₹" renders as "?" in some charsets. */
function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, '').replace(/,$/, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** "HDFC BANK" → "HDFCBANK", "TATA MOTORS" → "TATAMOTORS". */
export function normalizeBullTicker(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseAgeLabel(label: string): number {
  const m = label.match(/(\d+)\s*(min|hr|hour|day)s?\s+ago/i);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'min') return n;
  if (unit.startsWith('hr')) return n * 60;
  return n * 1440;
}

/** Splits homepage HTML into the individual live-call cards. */
function extractCards(html: string): string[] {
  const cleaned = stripComments(html);
  const cards: string[] = [];
  const regex = /<div class="rounded-xl border border-border bg-card[^>]*">(.*?)(?=<div class="rounded-xl border border-border bg-card|<\/section>)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    const body = m[1];
    if (body.includes('Entry</span>') && (body.includes('>BUY<') || body.includes('>SELL<'))) {
      cards.push(body);
    }
  }
  return cards;
}

function parseCard(card: string): BullScoreCall | null {
  const displayName = card.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1]?.trim();
  if (!displayName) return null;

  let direction: 'BUY' | 'SELL';
  if (card.includes('bg-destructive text-destructive-foreground">SELL<')) {
    direction = 'SELL';
  } else if (card.includes('bg-primary text-primary-foreground">BUY<')) {
    direction = 'BUY';
  } else {
    return null; // Not an actionable call card
  }

  const status = card.match(/rounded-full[^>]*bg-primary text-primary-foreground">([^<]+)<\/span>/)?.[1]?.trim() || 'LIVE';

  // Entry / Current / Stop Loss rows: each has label span followed by value span.
  // Current is nested inside a wrapper div, so use a lazy dot match for that row.
  const entry = toNumber(card.match(/Entry<\/span><span[^>]*>([^<]+)<\/span>/)?.[1] || '0');
  const current = toNumber(card.match(/Current<\/span>.*?<span[^>]*>([^<]+)<\/span>/)?.[1] || '0');
  const stopLoss = toNumber(card.match(/Stop Loss<\/span><span[^>]*>([^<]+)<\/span>/)?.[1] || '0');

  // Targets are the chips inside the "Targets" block. Preserve source order:
  // BUY lists nearest target first, SELL lists nearest (highest) target first.
  const targetsBlock = card.match(/>Targets<\/p>([\s\S]*?)<\/div>/)?.[1] || '';
  const targets = [...targetsBlock.matchAll(/text-primary">([^<]+)<\/span>/g)]
    .map(m => toNumber(m[1]))
    .filter(n => n > 0);

  const analyst = card.match(/<span class="text-sm text-foreground">([^<]+)<\/span>/)?.[1]?.trim() || 'BullScore Analyst';
  const ageLabel = card.match(/(\d+\s*(?:min|hr|hour|day)s?\s+ago|just now)/i)?.[1]?.toLowerCase() || '';
  const ageMinutes = ageLabel ? parseAgeLabel(ageLabel) : -1;
  const changePercent = entry > 0 ? ((current - entry) / entry) * 100 : 0;

  return {
    ticker: normalizeBullTicker(displayName),
    displayName,
    direction,
    status,
    entry,
    current,
    changePercent: parseFloat(changePercent.toFixed(2)),
    stopLoss,
    targets,
    analyst,
    ageLabel,
    ageMinutes,
  };
}

/** Fetches and parses BullScore's live analyst calls (cached 2 min). */
export async function fetchBullScoreCalls(): Promise<BullScoreCall[]> {
  const now = Date.now();
  if (bullCache.at && now - bullCache.at < CACHE_TTL_MS) {
    return bullCache.calls;
  }
  try {
    const res = await fetch('https://bullscore.in', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[BullScore] Fetch failed with status: ${res.status}`);
      return [];
    }
    const html = await res.text();
    const calls = extractCards(html)
      .map(parseCard)
      .filter((c): c is BullScoreCall => c !== null);

    bullCache = { at: now, calls };
    console.log(`[BullScore] Parsed ${calls.length} live calls:`, calls.map(c => `${c.ticker} ${c.direction} @₹${c.entry}`).join(', '));
    return calls;
  } catch (error) {
    console.warn('[BullScore] Error scraping live calls:', error);
    return [];
  }
}

/**
 * Backward-compatible wrapper returning ClassifiedNewsItem[] for the sentiment
 * pillar / background engine. Extracts the structural data for the new pick
 * pipeline via fetchBullScoreCalls().
 */
export async function fetchBullScoreLiveCalls(): Promise<ClassifiedNewsItem[]> {
  const calls = await fetchBullScoreCalls();
  return calls.map((c): ClassifiedNewsItem => ({
    headline: `Top Analyst Call: ${c.direction} ${c.displayName} Entry ₹${c.entry} Targets ₹${c.targets.join('/')}`,
    source: 'BullScore.in (Verified Analyst)',
    tickers: [c.ticker],
    region: 'INDIAN',
    sentiment: c.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
    impactScore: 95,
    llmEventType: 'ANALYST_UPGRADE',
    llmExpectedMovementPct: '2.5%',
  } as ClassifiedNewsItem));
}
