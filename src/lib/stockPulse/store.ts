'use client';

import type { GrowthClass, StockPulseMemory, StockPulseReport, ValuationVerdict } from './types';

const KEY = 'stock_pulse_memory_v1';
const MAX_SNAPSHOTS = 24;

function readAll(): Record<string, StockPulseMemory> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Record<string, StockPulseMemory> : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StockPulseMemory>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

export function getStockPulseMemory(ticker: string): StockPulseMemory | null {
  return readAll()[ticker.toUpperCase()] || null;
}

export function recordStockPulseReport(report: StockPulseReport): StockPulseMemory {
  const ticker = report.ticker.toUpperCase();
  const all = readAll();
  const prev = all[ticker];
  const snap = {
    at: report.generatedAt,
    pulseScore: report.pulse.score,
    verdict: report.valuation.verdict,
    growth: report.growth.class,
  };
  const snapshots = [...(prev?.snapshots || []), snap].slice(-MAX_SNAPSHOTS);
  const next: StockPulseMemory = {
    ticker,
    snapshots,
    lastReport: report,
    analysisCount: (prev?.analysisCount || 0) + 1,
    updatedAt: Date.now(),
  };
  all[ticker] = next;
  writeAll(all);
  return next;
}

export function getPulseTrend(ticker: string): { improving: boolean; delta: number } | null {
  const m = getStockPulseMemory(ticker);
  if (!m || m.snapshots.length < 2) return null;
  const a = m.snapshots[m.snapshots.length - 1].pulseScore;
  const b = m.snapshots[m.snapshots.length - 2].pulseScore;
  return { improving: a > b, delta: a - b };
}

export function listStudiedTickers(): string[] {
  return Object.keys(readAll()).sort((a, b) => (readAll()[b].updatedAt || 0) - (readAll()[a].updatedAt || 0));
}

export function summarizeLearning(ticker: string): string | null {
  const m = getStockPulseMemory(ticker);
  if (!m || m.analysisCount < 2) return null;
  const verdicts = m.snapshots.map(s => s.verdict);
  const growths = m.snapshots.map(s => s.growth);
  const last = m.snapshots[m.snapshots.length - 1];
  const first = m.snapshots[0];
  const scoreDelta = last.pulseScore - first.pulseScore;
  return `AI has studied ${ticker} ${m.analysisCount} times. Pulse moved ${scoreDelta >= 0 ? '+' : ''}${scoreDelta} since first scan. Recent valuation reads: ${verdicts.slice(-3).join(' → ')}. Growth trend: ${growths.slice(-3).join(' → ')}.`;
}
