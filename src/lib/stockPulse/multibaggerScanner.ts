import { INDIAN_EQUITY_TICKERS, NIFTY_50_TICKERS } from '@/lib/marketConfig';
import { getFullUniverse } from '@/lib/dynamicUniverse';
import { fetchRawFundamentals } from './fundamentalFetcher';
import { enrichTopMultibaggers } from './multibaggerDeepAnalysis';
import { scoreMultibagger } from './scoring';
import type { MultibaggerPick } from './types';
import type { RawFundamentals } from './fundamentalFetcher';

const N50 = new Set<string>(NIFTY_50_TICKERS);

/** Curated under-followed Indian names (semis, industrials, mid-cap growth) — always in rotation */
const GEM_SEED_TICKERS = [
  'MOSCHIP', 'KAYNES', 'SYRMA', 'DATAPATTNS', 'HBLENGINE', 'PARAS', 'AVALON',
  'CYIENTDLM', 'GRSE', 'COCHINSHIP', 'TANLA', 'INTELLECT', 'NEWGEN', 'KPITTECH',
  'SONACOMS', 'MTARTECH', 'APARINDS', 'GRAVITA', 'ELECON', 'TIMKEN',
];

// Instead of a static const, we generate the pool dynamically when scanning
function getScanPool() {
  const allTickers = getFullUniverse();
  return [
    ...GEM_SEED_TICKERS,
    ...allTickers.filter(t => !N50.has(t) && !GEM_SEED_TICKERS.includes(t)).slice(0, 140),
  ];
}

let rotateOffset = 0;

export async function scanMultibaggerCandidates(batchSize = 28, maxResults = 8): Promise<MultibaggerPick[]> {
  const pool = getScanPool();
  const batch: string[] = [];
  for (let i = 0; batch.length < batchSize; i++) {
    const t = pool[(rotateOffset + i) % pool.length];
    if (!batch.includes(t)) batch.push(t);
  }
  rotateOffset = (rotateOffset + batchSize) % pool.length;

  const picks: MultibaggerPick[] = [];
  const rawByTicker = new Map<string, RawFundamentals>();

  for (const ticker of batch) {
    try {
      const raw = await fetchRawFundamentals(ticker);
      if (!raw) continue;
      const pick = scoreMultibagger(raw);
      if (pick) {
        // CATALYST OVERRIDE: Boost Gems that have active high-impact corporate filings
        try {
          const { getNewsForTicker } = require('../newsStore');
          const recentNews = getNewsForTicker(ticker, 72); // 3 days for gems
          if (recentNews.length > 0) {
            const topNews = recentNews.sort((a: any, b: any) => b.impactScore - a.impactScore)[0];
            if (topNews && topNews.impactScore >= 70) {
              if (topNews.llmTradingSignal === 'BUY' || topNews.llmTradingSignal === 'STRONG_BUY' || topNews.llmEventType === 'ORDER_WIN' || topNews.llmEventType === 'TURNAROUND') {
                pick.score += 35; // Massive boost
                pick.tier = 'CANDIDATE'; // Upgrade to Candidate
                pick.gemArchetype = 'UNDERRATED_GEM'; // Force priority
                pick.deepAnalysis = (pick.deepAnalysis || '') + ` [LIVE CATALYST: ${topNews.llmEventType} detected via NSE Filing]`;
              }
            }
          }
        } catch { /* ignore if newsStore fails */ }

        picks.push(pick);
        rawByTicker.set(ticker, raw);
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 70));
  }

  const sorted = picks.sort((a, b) => {
    const aGem = a.gemArchetype === 'UNDERRATED_GEM' ? 3 : a.gemArchetype === 'TENBAGGER_WATCH' ? 2 : 1;
    const bGem = b.gemArchetype === 'UNDERRATED_GEM' ? 3 : b.gemArchetype === 'TENBAGGER_WATCH' ? 2 : 1;
    if (bGem !== aGem) return bGem - aGem;
    return b.score - a.score;
  });

  const top = sorted.slice(0, maxResults);
  return enrichTopMultibaggers(top, rawByTicker, 4);
}
