'use client';

import { isTier1MacroSource } from './eliteSources';
import { matchAllMacroEvents, getMacroShockSeverity } from './geoPoliticalMap';
import { fireMacroShock, clearMacroShock, getCurrentShock, isMacroDismissed } from './macroInterruptHandler';
import type { EngineMacroShock } from './engineState';
const MACRO_NEWS_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export function isMacroShockFresh(macro: EngineMacroShock | null | undefined, now = Date.now()): boolean {
  if (!macro?.active || !macro.headline) return false;
  const ts = macro.newsTimestamp;
  if (!ts || ts <= 0) return false;
  return now - ts <= MACRO_NEWS_MAX_AGE_MS;
}
export interface ServerMacroPayload {
  active: boolean;
  detail?: EngineMacroShock | null;
  info?: string | null;
}

/** Apply server-detected macro shock so client AI algorithms align with backend. */
export function applyServerMacroShock(payload: ServerMacroPayload): void {
  if (!payload.active || !payload.detail?.headline) {
    if (getCurrentShock()?.active) clearMacroShock();
    return;
  }

  const d = payload.detail;
  if (!isMacroShockFresh(d) || isMacroDismissed(d.headline)) {
    clearMacroShock();
    return;
  }

  const newsTs = d.newsTimestamp ?? d.detectedAt ?? Date.now();
  const impacts = matchAllMacroEvents(d.headline);
  const regime = d.forcedRegime || (impacts.length > 0 ? getMacroShockSeverity(impacts) : 'HIGH_VOLATILITY');
  const tier1Source = /^@/.test(d.source) || isTier1MacroSource(d.source);
  const indiaMacro = d.region === 'INDIAN' || impacts.some(i => i.id.startsWith('india-'));
  const indiaEmergency = d.impactIds?.some(id => id.startsWith('india-'));

  const region = d.region ?? (indiaMacro ? 'INDIAN' : 'INTERNATIONAL');

  if (impacts.length > 0 && (tier1Source || indiaMacro)) {
    fireMacroShock(d.source, d.headline, impacts, regime, newsTs, region);
    return;
  }

  if ((d.impactIds?.includes('llm-emergency') || indiaEmergency) && (tier1Source || d.region === 'INDIAN')) {
    fireMacroShock(d.source, d.headline, impacts, regime, newsTs, region);
  }
}
