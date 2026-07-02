// Market session analysis — real-time, no fake data

export type MarketSession = 'PRE_MARKET' | 'OPENING' | 'MIDDAY' | 'CLOSING' | 'POST_MARKET';

export interface SessionFeatures {
  session: MarketSession;
  minutesSinceOpen: number;
  minutesToClose: number;
  dayOfWeek: number;
  overnightGap: number;
  sessionLabel: string;
  isOpeningHalfHour: boolean;
  isClosingHalfHour: boolean;
}

export interface TradingSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  session: MarketSession;
  reason: string;
  confidence: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

const NSE_OPEN_HOUR = 9;
const NSE_OPEN_MIN = 15;
const NSE_CLOSE_HOUR = 15;
const NSE_CLOSE_MIN = 30;
const NSE_OPEN_TOTAL_MIN = NSE_OPEN_HOUR * 60 + NSE_OPEN_MIN;
const NSE_CLOSE_TOTAL_MIN = NSE_CLOSE_HOUR * 60 + NSE_CLOSE_MIN;
const NSE_SESSION_LENGTH = NSE_CLOSE_TOTAL_MIN - NSE_OPEN_TOTAL_MIN;

export function getMarketSession(now: Date = new Date()): SessionFeatures {
  const dayOfWeek = now.getDay();
  const totalMin = now.getHours() * 60 + now.getMinutes();

  let session: MarketSession;
  let minutesSinceOpen: number;
  let minutesToClose: number;

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend || totalMin < NSE_OPEN_TOTAL_MIN - 60) {
    session = 'PRE_MARKET';
    minutesSinceOpen = 0;
    minutesToClose = NSE_SESSION_LENGTH;
  } else if (totalMin < NSE_OPEN_TOTAL_MIN) {
    session = 'OPENING';
    minutesSinceOpen = 0;
    minutesToClose = NSE_SESSION_LENGTH - Math.max(0, totalMin - NSE_OPEN_TOTAL_MIN);
  } else if (totalMin <= NSE_OPEN_TOTAL_MIN + 30) {
    session = 'OPENING';
    minutesSinceOpen = totalMin - NSE_OPEN_TOTAL_MIN;
    minutesToClose = NSE_CLOSE_TOTAL_MIN - totalMin;
  } else if (totalMin >= NSE_CLOSE_TOTAL_MIN - 30 && totalMin <= NSE_CLOSE_TOTAL_MIN) {
    session = 'CLOSING';
    minutesSinceOpen = totalMin - NSE_OPEN_TOTAL_MIN;
    minutesToClose = NSE_CLOSE_TOTAL_MIN - totalMin;
  } else if (totalMin > NSE_OPEN_TOTAL_MIN + 30 && totalMin < NSE_CLOSE_TOTAL_MIN - 30) {
    session = 'MIDDAY';
    minutesSinceOpen = totalMin - NSE_OPEN_TOTAL_MIN;
    minutesToClose = NSE_CLOSE_TOTAL_MIN - totalMin;
  } else {
    session = 'POST_MARKET';
    minutesSinceOpen = totalMin > NSE_CLOSE_TOTAL_MIN ? NSE_SESSION_LENGTH : totalMin - NSE_OPEN_TOTAL_MIN;
    minutesToClose = 0;
  }

  const isOpeningHalfHour = session === 'OPENING' && totalMin >= NSE_OPEN_TOTAL_MIN && totalMin <= NSE_OPEN_TOTAL_MIN + 30;
  const isClosingHalfHour = session === 'CLOSING' && totalMin >= NSE_CLOSE_TOTAL_MIN - 30 && totalMin <= NSE_CLOSE_TOTAL_MIN;

  return {
    session,
    minutesSinceOpen: Math.max(0, minutesSinceOpen),
    minutesToClose: Math.max(0, minutesToClose),
    dayOfWeek,
    overnightGap: 0,
    sessionLabel: session,
    isOpeningHalfHour,
    isClosingHalfHour,
  };
}

export function getDayOfWeekName(day: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] || 'Unknown';
}

export function getDayOfWeekSignal(day: number): TradingSignal | null {
  const dayName = getDayOfWeekName(day);
  // Monday: often reversal / gap-fill day
  if (day === 1) return { type: 'HOLD', session: 'OPENING', reason: `${dayName} — wait for first 30 min to confirm direction`, confidence: 40, direction: 'NEUTRAL' };
  // Tuesday / Wednesday: trend day
  if (day === 2 || day === 3) return { type: 'BUY', session: 'MIDDAY', reason: `${dayName} — highest probability of trend continuation`, confidence: 55, direction: 'BULLISH' };
  // Thursday: profit booking
  if (day === 4) return { type: 'HOLD', session: 'MIDDAY', reason: `${dayName} — profit-booking pressure, avoid new longs`, confidence: 45, direction: 'NEUTRAL' };
  // Friday: weekly close
  if (day === 5) return { type: 'SELL', session: 'CLOSING', reason: `${dayName} — weekly closing, FIIs square off positions`, confidence: 50, direction: 'BEARISH' };
  return null;
}

export function getSessionTradingSignal(features: SessionFeatures): TradingSignal {
  const daySignal = getDayOfWeekSignal(features.dayOfWeek);

  if (features.isOpeningHalfHour) {
    return {
      type: 'HOLD',
      session: 'OPENING',
      reason: `Opening volatility — wait 30 min for direction confirmation. ${daySignal ? daySignal.reason : ''}`,
      confidence: 35,
      direction: 'NEUTRAL',
    };
  }

  if (features.isClosingHalfHour) {
    return {
      type: features.session === 'CLOSING' ? 'SELL' : 'HOLD',
      session: 'CLOSING',
      reason: 'Closing half-hour — institutional position squaring, avoid new entries',
      confidence: 60,
      direction: 'BEARISH',
    };
  }

  if (features.session === 'POST_MARKET') {
    return {
      type: 'HOLD',
      session: 'POST_MARKET',
      reason: 'Market closed — use closing price as reference for tomorrow',
      confidence: 70,
      direction: 'NEUTRAL',
    };
  }

  if (features.minutesSinceOpen < 60) {
    return {
      type: 'HOLD',
      session: 'OPENING',
      reason: `Early session — let first hour volume confirm the day's trend`,
      confidence: 40,
      direction: 'NEUTRAL',
    };
  }

  // Midday: follow the day-of-week signal
  if (daySignal && features.session === 'MIDDAY') {
    return daySignal;
  }

  return {
    type: 'HOLD',
    session: features.session,
    reason: `No clear session-based setup at this time`,
    confidence: 30,
    direction: 'NEUTRAL',
  };
}

export function computeOvernightGap(openPrice: number, prevClose: number): number {
  if (!prevClose || prevClose <= 0) return 0;
  return ((openPrice - prevClose) / prevClose) * 100;
}

export function interpretOvernightGap(gapPercent: number): { signal: TradingSignal; impact: string } {
  if (gapPercent > 1.5) return {
    signal: { type: 'SELL', session: 'OPENING', reason: `Gap-up >1.5% — frequent gap-fill pattern, wait for pullback`, confidence: 55, direction: 'BEARISH' },
    impact: 'Strong gap-up — potential exhaustion',
  };
  if (gapPercent > 0.5) return {
    signal: { type: 'BUY', session: 'OPENING', reason: `Moderate gap-up — bullish momentum continuation likely`, confidence: 50, direction: 'BULLISH' },
    impact: 'Mild gap-up — positive sentiment',
  };
  if (gapPercent < -1.5) return {
    signal: { type: 'BUY', session: 'OPENING', reason: `Gap-down >1.5% — oversold bounce candidate`, confidence: 55, direction: 'BULLISH' },
    impact: 'Strong gap-down — potential reversal',
  };
  if (gapPercent < -0.5) return {
    signal: { type: 'SELL', session: 'OPENING', reason: `Moderate gap-down — bearish momentum likely persists`, confidence: 50, direction: 'BEARISH' },
    impact: 'Mild gap-down — negative sentiment',
  };
  return {
    signal: { type: 'HOLD', session: 'OPENING', reason: `Flat open — no gap, follow price action from first candle`, confidence: 40, direction: 'NEUTRAL' },
    impact: 'Flat open — neutral',
  };
}
