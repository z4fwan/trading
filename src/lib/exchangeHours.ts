export type ExchangeId = 'NSE' | 'US' | 'CRYPTO' | 'FOREX' | 'LSE' | 'TSE' | 'HKEX' | 'FWB';
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

function getExchangeTimezone(id: ExchangeId): string {
  switch (id) {
    case 'NSE': return 'Asia/Kolkata';
    case 'US': return 'America/New_York';
    case 'CRYPTO': return 'UTC';
    case 'FOREX': return 'UTC';
    case 'LSE': return 'Europe/London';
    case 'TSE': return 'Asia/Tokyo';
    case 'HKEX': return 'Asia/Hong_Kong';
    case 'FWB': return 'Europe/Berlin';
    default: return 'UTC';
  }
}

export function getExchangeStatus(id: ExchangeId, now = new Date()): ExchangeStatus {
  // Crypto: 24/7/365
  if (id === 'CRYPTO') {
    const localTime = formatLocal('UTC', now);
    return { id, open: true, session: 'OPEN', label: 'Crypto 24/7', localTime, extendedActive: true };
  }

  // Forex: 24/5 (Sunday 5pm ET – Friday 5pm ET)
  if (id === 'FOREX') {
    const { day, hour, minute } = partsInTimeZone('America/New_York', now);
    const localTime = formatLocal('UTC', now);
    // Forex opens Sunday 5pm ET, closes Friday 5pm ET
    if (day === 6 || (day === 0 && hour < 17) || (day === 5 && hour >= 17)) {
      return { id, open: false, session: 'CLOSED', label: 'Forex weekend', localTime, extendedActive: false };
    }
    return { id, open: true, session: 'OPEN', label: 'Forex 24/5', localTime, extendedActive: true };
  }

  // NSE: Mon-Fri 9:15 AM – 3:30 PM IST
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

  // US: Mon-Fri 9:30 AM – 4:00 PM ET (pre 4am, post 8pm)
  if (id === 'US') {
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

  // LSE: Mon-Fri 8:00 AM – 4:30 PM GMT
  if (id === 'LSE') {
    const { day, hour, minute } = partsInTimeZone('Europe/London', now);
    const mins = hour * 60 + minute;
    const openStart = 8 * 60;
    const openEnd = 16 * 60 + 30;
    const localTime = formatLocal('Europe/London', now);

    if (day === 0 || day === 6) {
      return { id, open: false, session: 'CLOSED', label: 'LSE weekend', localTime, extendedActive: false };
    }
    if (mins >= openStart && mins < openEnd) {
      return { id, open: true, session: 'OPEN', label: 'LSE regular session', localTime, extendedActive: true };
    }
    return { id, open: false, session: 'CLOSED', label: 'LSE closed', localTime, extendedActive: false };
  }

  // TSE: Mon-Fri 9:00 AM – 3:00 PM JST
  if (id === 'TSE') {
    const { day, hour, minute } = partsInTimeZone('Asia/Tokyo', now);
    const mins = hour * 60 + minute;
    const openStart = 9 * 60;
    const openEnd = 15 * 60;
    const localTime = formatLocal('Asia/Tokyo', now);

    if (day === 0 || day === 6) {
      return { id, open: false, session: 'CLOSED', label: 'TSE weekend', localTime, extendedActive: false };
    }
    if (mins >= openStart && mins < openEnd) {
      return { id, open: true, session: 'OPEN', label: 'TSE regular session', localTime, extendedActive: true };
    }
    return { id, open: false, session: 'CLOSED', label: 'TSE closed', localTime, extendedActive: false };
  }

  // HKEX: Mon-Fri 9:30 AM – 4:00 PM HKT
  if (id === 'HKEX') {
    const { day, hour, minute } = partsInTimeZone('Asia/Hong_Kong', now);
    const mins = hour * 60 + minute;
    const openStart = 9 * 60 + 30;
    const openEnd = 16 * 60;
    const localTime = formatLocal('Asia/Hong_Kong', now);

    if (day === 0 || day === 6) {
      return { id, open: false, session: 'CLOSED', label: 'HKEX weekend', localTime, extendedActive: false };
    }
    if (mins >= openStart && mins < openEnd) {
      return { id, open: true, session: 'OPEN', label: 'HKEX regular session', localTime, extendedActive: true };
    }
    return { id, open: false, session: 'CLOSED', label: 'HKEX closed', localTime, extendedActive: false };
  }

  // FWB: Mon-Fri 9:00 AM – 5:30 PM CET
  if (id === 'FWB') {
    const { day, hour, minute } = partsInTimeZone('Europe/Berlin', now);
    const mins = hour * 60 + minute;
    const openStart = 9 * 60;
    const openEnd = 17 * 60 + 30;
    const localTime = formatLocal('Europe/Berlin', now);

    if (day === 0 || day === 6) {
      return { id, open: false, session: 'CLOSED', label: 'FWB weekend', localTime, extendedActive: false };
    }
    if (mins >= openStart && mins < openEnd) {
      return { id, open: true, session: 'OPEN', label: 'FWB regular session', localTime, extendedActive: true };
    }
    return { id, open: false, session: 'CLOSED', label: 'FWB closed', localTime, extendedActive: false };
  }

  const localTime = formatLocal('UTC', now);
  return { id, open: false, session: 'CLOSED', label: 'Unknown', localTime, extendedActive: false };
}

export type MarketPhase = 'REGULAR' | 'EXTENDED' | 'OFF_HOURS' | 'WEEKEND';

export interface MarketSummary {
  nse: ExchangeStatus;
  us: ExchangeStatus;
  crypto: ExchangeStatus;
  forex: ExchangeStatus;
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
  crypto: { id: 'CRYPTO', open: true, session: 'OPEN', label: 'Crypto', localTime: '--:--', extendedActive: true },
  forex: { id: 'FOREX', open: false, session: 'CLOSED', label: 'Forex', localTime: '--:--', extendedActive: false },
  anyOpen: true,
  priceTicksExpected: true,
  feedLive: true,
  phase: 'REGULAR',
  statusMessage: 'Loading market status…',
  liveExpected: true,
};

export function classifyExchange(symbol: string): ExchangeId {
  // Crypto: BTC-USD, ETH-USD, etc.
  if (/-USD$/i.test(symbol) || /^BTC|^ETH|^BNB|^XRP|^ADA|^SOL|^DOGE|^DOT|^AVAX|^SHIB|^TRX|^LINK|^BCH|^LTC|^MATIC|^UNI|^ATOM|^XLM|^ALGO|^FIL|^APT|^ARB|^OP|^NEAR|^ICP|^PEPE|^WIF|^FET|^RNDR|^INJ|^TIA|^SEI|^SUI|^JUP|^ORDI|^STX|^AAVE|^MKR|^CRV|^LDO|^RPL|^GRT|^SAND|^MANA|^AXS|^IMX|^FLOW|^HBAR|^VET|^XMR|^DASH/i.test(symbol)) return 'CRYPTO';
  // Forex: EURUSD=X, GBPUSD=X, etc.
  if (/=X$/i.test(symbol)) return 'FOREX';
  // NSE India
  if (symbol.endsWith('.NS') || symbol === '^NSEI' || symbol === '^NSEBANK' || symbol === '^BSESN') return 'NSE';
  // UK LSE
  if (symbol.endsWith('.L')) return 'LSE';
  // Japan TSE
  if (symbol.endsWith('.T') && /^\d+\.T$/.test(symbol)) return 'TSE';
  // Hong Kong HKEX
  if (symbol.endsWith('.HK')) return 'HKEX';
  // Germany FWB
  if (symbol.endsWith('.DE')) return 'FWB';
  // Default to US
  return 'US';
}

/** Returns the primary exchange for a symbol — used for frozen/live logic. */
function exchangeForYahooSymbol(sym: string): ExchangeId {
  return classifyExchange(sym);
}

export function exchangeStatusForSymbol(sym: string, market: MarketSummary): ExchangeStatus {
  const id = exchangeForYahooSymbol(sym);
  if (id === 'NSE') return market.nse;
  if (id === 'US') return market.us;
  if (id === 'CRYPTO') return market.crypto;
  if (id === 'FOREX') return market.forex;
  // For LSE, TSE, HKEX, FWB — derive from current time since we don't track them in summary
  return getExchangeStatus(id);
}

/** No new trades expected — keep one stable last-close price (no intraday overlay). */
export function isSymbolFrozen(sym: string, market: MarketSummary): boolean {
  const status = exchangeStatusForSymbol(sym, market);
  if (status.open) return false;
  if (status.session === 'PRE' || status.session === 'POST') return false;
  return true;
}

export function getMarketSummary(now = new Date()): MarketSummary {
  const nse = getExchangeStatus('NSE', now);
  const us = getExchangeStatus('US', now);
  const crypto = getExchangeStatus('CRYPTO', now);
  const forex = getExchangeStatus('FOREX', now);
  const anyOpen = nse.open || us.open || crypto.open || forex.open;
  const isWeekend = nse.session === 'CLOSED' && nse.label.includes('weekend')
    || us.session === 'CLOSED' && us.label.includes('weekend');
  const inPrePost = nse.session === 'PRE' || nse.session === 'POST' || us.session === 'PRE' || us.session === 'POST';

  let phase: MarketPhase;
  if (isWeekend && !crypto.open && !forex.open) phase = 'WEEKEND';
  else if (anyOpen) phase = 'REGULAR';
  else if (inPrePost) phase = 'EXTENDED';
  else phase = 'OFF_HOURS';

  /** True only when at least one exchange can print new trades (regular or pre/post). */
  const priceTicksExpected = anyOpen || inPrePost;

  const openMarkets: string[] = [];
  if (nse.open) openMarkets.push('NSE');
  if (us.open) openMarkets.push('US');
  if (crypto.open) openMarkets.push('Crypto');
  if (forex.open) openMarkets.push('Forex');

  let statusMessage: string;
  if (openMarkets.length > 0) {
    statusMessage = `LIVE — ${openMarkets.join(' + ')} markets (Yahoo Finance feed)`;
  } else if (inPrePost) {
    statusMessage = 'LIVE — Pre/post-market: extended-hours prices from Yahoo';
  } else if (crypto.open || forex.open) {
    statusMessage = 'LIVE — Crypto/Forex 24/7 (Yahoo Finance feed)';
  } else if (isWeekend) {
    statusMessage = 'MARKET CLOSED (weekend) — Crypto & Forex still live; stock prices fixed until exchanges reopen';
  } else {
    statusMessage = 'MARKET CLOSED — Crypto & Forex live; stock prices fixed until next session';
  }

  return {
    nse,
    us,
    crypto,
    forex,
    anyOpen,
    priceTicksExpected,
    feedLive: true,
    phase,
    statusMessage,
    liveExpected: priceTicksExpected,
  };
}
