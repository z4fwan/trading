// Macro Interrupt Handler — The "God Mode" AI Override
// Fires MACRO_SHOCK events that force global regime shifts, veto signals,
// and auto-generate safe-haven recommendations.

import type { GeopoliticalImpact } from './geoPoliticalMap';

export interface MacroShockEvent {
  detectedAt: number;
  /** When the news article was published (not when we detected it). */
  newsPublishedAt: number;
  source: string;
  headline: string;
  impacts: GeopoliticalImpact[];
  forcedRegime: 'PANIC' | 'HIGH_VOLATILITY';
  vetoedTickers: string[];
  safeHavenTickers: string[];
  bullishTickers: string[];
  active: boolean;
  region?: 'INDIAN' | 'US' | 'CRYPTO' | 'FOREX' | 'FOREIGN' | 'INTERNATIONAL';
}

let currentShock: MacroShockEvent | null = null;
let shockStartTime = 0;
const SHOCK_SESSION_MS = 30 * 60 * 1000; // hide 30 minutes after last activation
const MACRO_NEWS_MAX_AGE_MS = 8 * 60 * 60 * 1000; // article must be < 8 hours old
let subscribers: Array<(event: MacroShockEvent | null) => void> = [];
const DISMISS_KEY = 'macro-shock-dismissed-headline';

export function isMacroDismissed(headline: string): boolean {
  if (typeof window === 'undefined' || !headline) return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === headline;
  } catch {
    return false;
  }
}

export function dismissMacroShock(headline?: string): void {
  if (typeof window !== 'undefined' && headline) {
    try { sessionStorage.setItem(DISMISS_KEY, headline); } catch { /* ignore */ }
  }
  clearMacroShock();
}

export function getCurrentShock(): MacroShockEvent | null {
  if (!currentShock) return null;
  const now = Date.now();
  if (now - currentShock.newsPublishedAt > MACRO_NEWS_MAX_AGE_MS) {
    clearMacroShock();
    return null;
  }
  if (isMacroDismissed(currentShock.headline)) {
    clearMacroShock();
    return null;
  }
  if (now - shockStartTime > SHOCK_SESSION_MS) {
    clearMacroShock();
    return null;
  }
  return currentShock;
}

export function isMacroShockActive(): boolean {
  return getCurrentShock()?.active ?? false;
}

export function getForcedRegime(): 'PANIC' | 'HIGH_VOLATILITY' | null {
  return getCurrentShock()?.forcedRegime ?? null;
}

export function subscribeToMacroShock(listener: (event: MacroShockEvent | null) => void): () => void {
  subscribers.push(listener);
  return () => {
    subscribers = subscribers.filter(l => l !== listener);
  };
}

export function fireMacroShock(
  source: string,
  headline: string,
  impacts: GeopoliticalImpact[],
  forcedRegime: 'PANIC' | 'HIGH_VOLATILITY',
  newsPublishedAt = Date.now(),
  region?: 'INDIAN' | 'US' | 'CRYPTO' | 'FOREX' | 'FOREIGN' | 'INTERNATIONAL',
): MacroShockEvent {
  const now = Date.now();
  if (now - newsPublishedAt > MACRO_NEWS_MAX_AGE_MS) {
    clearMacroShock();
    return {
      detectedAt: now,
      newsPublishedAt,
      source,
      headline,
      impacts,
      forcedRegime,
      vetoedTickers: [],
      safeHavenTickers: [],
      bullishTickers: [],
      active: false,
    };
  }
  if (isMacroDismissed(headline)) {
    clearMacroShock();
    return {
      detectedAt: now,
      newsPublishedAt,
      source,
      headline,
      impacts,
      forcedRegime,
      vetoedTickers: [],
      safeHavenTickers: [],
      bullishTickers: [],
      active: false,
    };
  }
  const event: MacroShockEvent = {
    detectedAt: now,
    newsPublishedAt,
    source,
    headline,
    impacts,
    forcedRegime,
    vetoedTickers: [...new Set(impacts.flatMap(i => i.affectedMarkets))],
    safeHavenTickers: [...new Set(impacts.flatMap(i => i.safeHavens))],
    bullishTickers: [...new Set(impacts.filter(i => i.action === 'BULLISH').flatMap(i => i.tickers))],
    active: true,
    region,
  };

  currentShock = event;
  shockStartTime = Date.now();

  for (const cb of subscribers) {
    try { cb(event); } catch { /* subscriber error */ }
  }

  return event;
}

export function clearMacroShock(): void {
  if (currentShock) {
    currentShock = { ...currentShock, active: false };
    for (const cb of subscribers) {
      try { cb(null); } catch { /* subscriber error */ }
    }
  }
  currentShock = null;
}

// React hook helper — called from components to get reactive state
import { useState, useEffect } from 'react';

export function useMacroShock(): MacroShockEvent | null {
  const [shock, setShock] = useState<MacroShockEvent | null>(getCurrentShock);

  useEffect(() => {
    const unsub = subscribeToMacroShock(setShock);
    // Re-check on mount and every 30s for auto-expiry
    const timer = setInterval(() => {
      setShock(getCurrentShock());
    }, 30000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  return shock;
}
