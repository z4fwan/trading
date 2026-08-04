import fs from 'fs';
import path from 'path';

export interface IntradayCall {
  id: string;
  ticker: string;
  name: string;
  direction: 'BULLISH' | 'BEARISH';
  confidence: number;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  quantity: number;
  predictedReturnPct: number;
  riskReward: number;
  reasoning: string[];
  keyFactors: string[];
  createdAt: number;
  resolvedAt?: number;
  status: 'ACTIVE' | 'HIT_TARGET' | 'STOPPED_OUT' | 'EXPIRED';
}

export interface IntradayPlan {
  totalCalls: number;
  suggestedTrades: number;
  maxTrades: number;
  capitalPerTrade: number;
  maxLossPerTrade: number;
  maxLossPerDay: number;
  riskPerTradePercent: number;
  minProfitTarget: number;
  positionSizingMethod: string;
}

interface PersistedData {
  calls: IntradayCall[];
  plan: IntradayPlan | null;
  lastGenerated: number;
}

const STORE_PATH = path.join(process.cwd(), '.intraday-store.json');

function loadFromDisk(): PersistedData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch { /* corrupt or missing file */ }
  return { calls: [], plan: null, lastGenerated: 0 };
}

function saveToDisk(data: PersistedData): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* silent */ }
}

const persisted = loadFromDisk();
let callsCache: IntradayCall[] = persisted.calls;
let planCache: IntradayPlan | null = persisted.plan;
let lastGeneratedTs: number = persisted.lastGenerated;

function persist(): void {
  saveToDisk({ calls: callsCache, plan: planCache, lastGenerated: lastGeneratedTs });
}

export function getIntradayCalls(): IntradayCall[] {
  return callsCache;
}

export function setIntradayCalls(calls: IntradayCall[]): void {
  callsCache = calls;
  persist();
}

export function updateCall(id: string, updates: Partial<IntradayCall>): void {
  const idx = callsCache.findIndex(c => c.id === id);
  if (idx !== -1) {
    callsCache[idx] = { ...callsCache[idx], ...updates };
    persist();
  }
}

export function getIntradayPlan(): IntradayPlan | null {
  return planCache;
}

export function setIntradayPlan(plan: IntradayPlan | null): void {
  planCache = plan;
  persist();
}

export function getLastGenerated(): number {
  return lastGeneratedTs;
}

export function setLastGenerated(ts: number): void {
  lastGeneratedTs = ts;
  persist();
}

export function resolveCalls(currentPrices: Record<string, number>): { resolved: number; active: number } {
  let resolved = 0;
  for (const call of callsCache) {
    if (call.status !== 'ACTIVE') continue;
    const price = currentPrices[call.ticker] ?? currentPrices[`${call.ticker}.NS`] ?? currentPrices[`${call.ticker}.BO`];
    if (!price) continue;
    call.currentPrice = price;
    if (call.direction === 'BULLISH') {
      if (price >= call.targetPrice) {
        call.status = 'HIT_TARGET';
        call.resolvedAt = Date.now();
        resolved++;
      } else if (price <= call.stopLoss) {
        call.status = 'STOPPED_OUT';
        call.resolvedAt = Date.now();
        resolved++;
      }
    } else {
      if (price <= call.targetPrice) {
        call.status = 'HIT_TARGET';
        call.resolvedAt = Date.now();
        resolved++;
      } else if (price >= call.stopLoss) {
        call.status = 'STOPPED_OUT';
        call.resolvedAt = Date.now();
        resolved++;
      }
    }
  }
  // Expire calls older than 6 hours
  const now = Date.now();
  for (const call of callsCache) {
    if (call.status !== 'ACTIVE') continue;
    if (now - call.createdAt > 6 * 60 * 60 * 1000) {
      call.status = 'EXPIRED';
      call.resolvedAt = now;
      resolved++;
    }
  }
  if (resolved > 0) persist();
  return { resolved, active: callsCache.filter(c => c.status === 'ACTIVE').length };
}

export function clearResolved(): void {
  callsCache = callsCache.filter(c => c.status === 'ACTIVE');
  persist();
}
