/**
 * Options Flow Analysis — Detects unusual options activity before price moves.
 * Tracks volume spikes, put/call ratio shifts, and large block trades.
 * Uses Yahoo Finance options chain data (free, no API key).
 */

interface OptionContract {
  ticker: string;
  strike: number;
  expiry: string;
  type: 'CALL' | 'PUT';
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  lastPrice: number;
  bid: number;
  ask: number;
  delta?: number;
}

interface UnusualActivity {
  ticker: string;
  type: 'VOLUME_SPIKE' | 'OPEN_INTEREST_SURGE' | 'LARGE_BLOCK' | 'PUT_CALL_SHIFT' | 'IV_CRUSH' | 'IV_SPIKE';
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  description: string;
  contracts: OptionContract[];
  timestamp: number;
}

interface OptionsChain {
  ticker: string;
  expiry: string;
  calls: OptionContract[];
  puts: OptionContract[];
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  totalCallOI: number;
  totalPutOI: number;
  avgIV: number;
  fetchedAt: number;
}

const chainCache = new Map<string, OptionsChain>();
const CHAIN_TTL = 15 * 60 * 1000; // 15 min

const VOLUME_SPIKE_THRESHOLD = 3.0; // 3x average volume
const OI_SURGE_THRESHOLD = 2.0; // 2x average OI
const PUT_CALL_RATIO_HIGH = 1.5; // bearish signal
const PUT_CALL_RATIO_LOW = 0.5; // bullish signal

export async function fetchOptionsChain(ticker: string): Promise<OptionsChain | null> {
  const cached = chainCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < CHAIN_TTL) return cached;

  try {
    const yahooSym = ticker.includes('.') ? ticker : ticker;
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${yahooSym}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const expiry = result.expirationDates?.[0];
    if (!expiry) return null;

    const expiryDate = new Date(expiry * 1000).toISOString().split('T')[0];
    const options = result.options?.[0];
    if (!options) return null;

    const calls: OptionContract[] = (options.calls || []).map((c: any) => ({
      ticker,
      strike: c.strike,
      expiry: expiryDate,
      type: 'CALL' as const,
      volume: c.volume || 0,
      openInterest: c.openInterest || 0,
      impliedVolatility: c.impliedVolatility || 0,
      lastPrice: c.lastPrice || 0,
      bid: c.bid || 0,
      ask: c.ask || 0,
    }));

    const puts: OptionContract[] = (options.puts || []).map((p: any) => ({
      ticker,
      strike: p.strike,
      expiry: expiryDate,
      type: 'PUT' as const,
      volume: p.volume || 0,
      openInterest: p.openInterest || 0,
      impliedVolatility: p.impliedVolatility || 0,
      lastPrice: p.lastPrice || 0,
      bid: p.bid || 0,
      ask: p.ask || 0,
    }));

    const totalCallVolume = calls.reduce((s, c) => s + c.volume, 0);
    const totalPutVolume = puts.reduce((s, p) => s + p.volume, 0);
    const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
    const totalPutOI = puts.reduce((s, p) => s + p.openInterest, 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;
    const allIV = [...calls, ...puts].map(c => c.impliedVolatility).filter(v => v > 0);
    const avgIV = allIV.length > 0 ? allIV.reduce((s, v) => s + v, 0) / allIV.length : 0;

    const chain: OptionsChain = {
      ticker, expiry, calls, puts,
      putCallRatio, totalCallVolume, totalPutVolume,
      totalCallOI, totalPutOI, avgIV, fetchedAt: Date.now(),
    };

    chainCache.set(ticker, chain);
    return chain;
  } catch {
    return null;
  }
}

function detectVolumeSpikes(chain: OptionsChain): UnusualActivity[] {
  const activities: UnusualActivity[] = [];
  const allContracts = [...chain.calls, ...chain.puts];

  for (const contract of allContracts) {
    if (contract.volume > 0 && contract.openInterest > 0) {
      const ratio = contract.volume / contract.openInterest;
      if (ratio >= VOLUME_SPIKE_THRESHOLD) {
        const signal = contract.type === 'CALL' ? 'BULLISH' : 'BEARISH';
        activities.push({
          ticker: chain.ticker,
          type: 'VOLUME_SPIKE',
          signal,
          confidence: Math.min(90, 50 + ratio * 10),
          description: `${contract.type} ${contract.strike} vol ${ratio.toFixed(1)}x OI (${contract.volume} vs ${contract.openInterest})`,
          contracts: [contract],
          timestamp: Date.now(),
        });
      }
    }
  }

  return activities;
}

function detectPutCallShift(chain: OptionsChain): UnusualActivity | null {
  if (chain.putCallRatio >= PUT_CALL_RATIO_HIGH) {
    return {
      ticker: chain.ticker,
      type: 'PUT_CALL_SHIFT',
      signal: 'BEARISH',
      confidence: Math.min(85, 50 + (chain.putCallRatio - 1) * 30),
      description: `High put/call ratio ${chain.putCallRatio.toFixed(2)} (${chain.totalPutVolume}P / ${chain.totalCallVolume}C)`,
      contracts: [],
      timestamp: Date.now(),
    };
  }
  if (chain.putCallRatio <= PUT_CALL_RATIO_LOW && chain.totalCallVolume > 100) {
    return {
      ticker: chain.ticker,
      type: 'PUT_CALL_SHIFT',
      signal: 'BULLISH',
      confidence: Math.min(85, 50 + (1 - chain.putCallRatio) * 30),
      description: `Low put/call ratio ${chain.putCallRatio.toFixed(2)} — heavy call buying`,
      contracts: [],
      timestamp: Date.now(),
    };
  }
  return null;
}

function detectLargeBlocks(chain: OptionsChain): UnusualActivity[] {
  const activities: UnusualActivity[] = [];
  const LARGE_BLOCK_SIZE = 500; // 500+ contracts = institutional

  for (const contract of [...chain.calls, ...chain.puts]) {
    if (contract.volume >= LARGE_BLOCK_SIZE || contract.openInterest >= LARGE_BLOCK_SIZE) {
      const signal = contract.type === 'CALL' ? 'BULLISH' : 'BEARISH';
      activities.push({
        ticker: chain.ticker,
        type: 'LARGE_BLOCK',
        signal,
        confidence: Math.min(95, 60 + contract.volume / 100),
        description: `Block trade: ${contract.volume} ${contract.type}s @ ${contract.strike} (OI: ${contract.openInterest})`,
        contracts: [contract],
        timestamp: Date.now(),
      });
    }
  }

  return activities;
}

function detectIVAnomaly(chain: OptionsChain): UnusualActivity | null {
  const allIV = [...chain.calls, ...chain.puts].map(c => c.impliedVolatility).filter(v => v > 0);
  if (allIV.length < 10) return null;

  const avgIV = allIV.reduce((s, v) => s + v, 0) / allIV.length;
  const maxIV = Math.max(...allIV);
  const ivRatio = maxIV / Math.max(0.01, avgIV);

  if (ivRatio > 2.0) {
    // Find which contracts have the high IV
    const highIVContracts = [...chain.calls, ...chain.puts]
      .filter(c => c.impliedVolatility > avgIV * 2)
      .slice(0, 3);
    
    return {
      ticker: chain.ticker,
      type: 'IV_SPIKE',
      signal: 'NEUTRAL',
      confidence: Math.min(80, 50 + ivRatio * 10),
      description: `IV spike: max ${(maxIV * 100).toFixed(0)}% vs avg ${(avgIV * 100).toFixed(0)}% (${ivRatio.toFixed(1)}x)`,
      contracts: highIVContracts,
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Full options flow analysis for a ticker.
 */
export async function analyzeOptionsFlow(ticker: string): Promise<UnusualActivity[]> {
  const chain = await fetchOptionsChain(ticker);
  if (!chain) return [];

  const activities: UnusualActivity[] = [];

  activities.push(...detectVolumeSpikes(chain));
  activities.push(...detectLargeBlocks(chain));

  const pcShift = detectPutCallShift(chain);
  if (pcShift) activities.push(pcShift);

  const ivAnomaly = detectIVAnomaly(chain);
  if (ivAnomaly) activities.push(ivAnomaly);

  return activities.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Scan multiple tickers for unusual options activity.
 */
export async function scanUnusualOptionsActivity(
  tickers: string[],
  maxConcurrent = 5,
): Promise<Map<string, UnusualActivity[]>> {
  const results = new Map<string, UnusualActivity[]>();

  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(batch.map(t => analyzeOptionsFlow(t)));
    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        results.set(batch[idx], r.value);
      }
    });
    if (i + maxConcurrent < tickers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

export function getOptionsFlowStats(): { cachedChains: number } {
  return { cachedChains: chainCache.size };
}
