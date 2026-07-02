export type ExchangeId = 'NSE' | 'US';
export type ExchangeSession = 'PRE' | 'OPEN' | 'POST' | 'CLOSED';

export interface ExchangeStatus {
  id: ExchangeId;
  open: boolean;
  session: ExchangeSession;
  label: string;
  localTime: string;
  /** Pre/post-market or regular — prices can still move */
  extendedActive: boolean;
}

function partsInTimeZone(tz: string, now = new Date()): { day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sun';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 0, hour, minute };
}

function formatLocal(tz: string, now = new Date()): string {
  return now.toLocaleString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
}

export function getExchangeStatus(id: ExchangeId, now = new Date()): ExchangeStatus {
  if (id === 'NSE') {
    const { day, hour, minute } = partsInTimeZone('Asia/Kolkata', now);
    const mins = hour * 60 + minute;
    const openStart = 9 * 60 + 15;
    const openEnd = 15 * 60 + 30;
    const preStart = 9 * 60;
    const localTime = formatLocal('Asia/Kolkata', now);

    if (day === 0 || day === 6) {
      return { id, open: false, session: 'CLOSED', label: 'NSE weekend', localTime, extendedActive: false };
    }
    if (mins >= openStart && mins <= openEnd) {
      return { id, open: true, session: 'OPEN', label: 'NSE regular session', localTime, extendedActive: true };
    }
    if (mins >= preStart && mins < openStart) {
      return { id, open: false, session: 'PRE', label: 'NSE pre-open', localTime, extendedActive: true };
    }
    if (mins > openEnd && mins < 17 * 60) {
      return { id, open: false, session: 'POST', label: 'NSE post-close', localTime, extendedActive: true };
    }
    return { id, open: false, session: 'CLOSED', label: 'NSE closed', localTime, extendedActive: false };
  }

  const { day, hour, minute } = partsInTimeZone('America/New_York', now);
  const mins = hour * 60 + minute;
  const openStart = 9 * 60 + 30;
  const openEnd = 16 * 60;
  const preStart = 4 * 60;
  const postEnd = 20 * 60;
  const localTime = formatLocal('America/New_York', now);

  if (day === 0 || day === 6) {
    return { id, open: false, session: 'CLOSED', label: 'US weekend', localTime, extendedActive: false };
  }
  if (mins >= openStart && mins < openEnd) {
    return { id, open: true, session: 'OPEN', label: 'US regular session', localTime, extendedActive: true };
  }
  if (mins >= preStart && mins < openStart) {
    return { id, open: false, session: 'PRE', label: 'US pre-market', localTime, extendedActive: true };
  }
  if (mins >= openEnd && mins < postEnd) {
    return { id, open: false, session: 'POST', label: 'US after-hours', localTime, extendedActive: true };
  }
  return { id, open: false, session: 'CLOSED', label: 'US closed', localTime, extendedActive: false };
}

export type MarketPhase = 'REGULAR' | 'EXTENDED' | 'OFF_HOURS' | 'WEEKEND';

export interface MarketSummary {
  nse: ExchangeStatus;
  us: ExchangeStatus;
  anyOpen: boolean;
  /** Regular or extended-hours — Yahoo often still publishes trades */
  priceTicksExpected: boolean;
  /** Feed always polls; UI shows LIVE when connected */
  feedLive: boolean;
  phase: MarketPhase;
  statusMessage: string;
  /** @deprecated use priceTicksExpected */
  liveExpected: boolean;
}

/** Stable SSR/hydration placeholder — no live clock strings. */
export const STATIC_MARKET_PLACEHOLDER: MarketSummary = {
  nse: { id: 'NSE', open: false, session: 'CLOSED', label: 'NSE', localTime: '--:--', extendedActive: false },
  us: { id: 'US', open: false, session: 'CLOSED', label: 'US', localTime: '--:--', extendedActive: false },
  anyOpen: false,
  priceTicksExpected: false,
  feedLive: true,
  phase: 'OFF_HOURS',
  statusMessage: 'Loading market status…',
  liveExpected: false,
};

function exchangeForYahooSymbol(sym: string): ExchangeId {
  if (sym.endsWith('.NS') || sym === '^NSEI' || sym === '^NSEBANK' || sym === '^BSESN') return 'NSE';
  return 'US';
}

export function exchangeStatusForSymbol(sym: string, market: MarketSummary): ExchangeStatus {
  return exchangeForYahooSymbol(sym) === 'NSE' ? market.nse : market.us;
}

/** No new trades expected — keep one stable last-close price (no intraday overlay). */
export function isSymbolFrozen(sym: string, market: MarketSummary): boolean {
  const status = exchangeForYahooSymbol(sym) === 'NSE' ? market.nse : market.us;
  if (status.open) return false;
  if (status.session === 'PRE' || status.session === 'POST') return false;
  return true;
}

export function getMarketSummary(now = new Date()): MarketSummary {
  const nse = getExchangeStatus('NSE', now);
  const us = getExchangeStatus('US', now);
  const anyOpen = nse.open || us.open;
  const isWeekend = nse.session === 'CLOSED' && nse.label.includes('weekend')
    || us.session === 'CLOSED' && us.label.includes('weekend');
  const inPrePost = nse.session === 'PRE' || nse.session === 'POST' || us.session === 'PRE' || us.session === 'POST';

  let phase: MarketPhase;
  if (isWeekend) phase = 'WEEKEND';
  else if (anyOpen) phase = 'REGULAR';
  else if (inPrePost) phase = 'EXTENDED';
  else phase = 'OFF_HOURS';

  /** True only when at least one exchange can print new trades (regular or pre/post). */
  const priceTicksExpected = anyOpen || inPrePost;

  let statusMessage: string;
  if (anyOpen) {
    statusMessage = nse.open && us.open
      ? 'LIVE — NSE + US regular sessions (Yahoo quote feed, same source as Google Finance)'
      : nse.open
        ? 'LIVE — NSE regular session (Yahoo quote feed)'
        : 'LIVE — US regular session (Yahoo quote feed)';
  } else if (inPrePost) {
    statusMessage = 'LIVE — Pre/post-market: using extended-hours prices from Yahoo (updates when trades print)';
  } else if (isWeekend) {
    statusMessage = 'MARKET CLOSED (weekend) — showing last official close from Yahoo; prices stay fixed until exchanges reopen';
  } else {
    statusMessage = 'MARKET CLOSED — showing last close; no fake ticks until pre-market or next session';
  }

  return {
    nse,
    us,
    anyOpen,
    priceTicksExpected,
    feedLive: true,
    phase,
    statusMessage,
    liveExpected: priceTicksExpected,
  };
}
