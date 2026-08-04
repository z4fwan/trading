/**
 * SEC EDGAR Filing Fetcher — Detects insider selling, 8-K material events, Form 4.
 * Free API: data.sec.gov (no key required, just User-Agent header).
 * Rate limit: 10 requests/sec.
 */

interface SECFiling {
  ticker: string;
  formType: string;
  filedAt: string;
  description: string;
  url: string;
  isHighImpact: boolean;
}

// Map common tickers to SEC CIK numbers (zero-padded to 10 digits)
const TICKER_TO_CIK: Record<string, string> = {
  AAPL: '0000320193', MSFT: '0000789019', GOOGL: '0001652044', GOOG: '0001652044',
  AMZN: '0001018724', NVDA: '0001045810', META: '0001326801', TSLA: '0001318605',
  JPM: '0000019617', V: '0000140317', JNJ: '0000192282', WMT: '0000104169',
  PG: '0000080424', MA: '0000896872', UNH: '0000731766', HD: '0000354950',
  DIS: '0001001039', BAC: '0000070858', XOM: '0000034088', PFE: '0000078003',
  KO: '0000021344', CSCO: '0000132680', NFLX: '0001065280', INTC: '0000050863',
  CRM: '0001108524', AMD: '0000024885', ABT: '0000001800', ORCL: '0000134143',
  COST: '0000909832', NKE: '0000320187', MRK: '0000031321', PEP: '0000078707',
  TMO: '0000091591', ABBV: '0000155115', ACN: '0000146785', T: '0000073271',
  LLY: '0000059478', AVGO: '0000776981', TXN: '0000097476', QCOM: '0000804328',
  BA: '0000012927', GE: '0000040545', CAT: '0000018230', DE: '0000315066',
  CVX: '0000093410', WFC: '0000072971', GS: '0000088698', MS: '0000895421',
  BLK: '0001090727', SPGI: '0000064040', CME: '0001364738', ISRG: '0001035267',
  SNPS: '0000873474', CDNS: '0000813828', NOW: '0001373715', MCD: '0000063908',
  AMGN: '0000031815', GILD: '0000882095', BKNG: '0001075531', PYPL: '0001633917',
  ADP: '0000008140', REGN: '0000087258', CMG: '0001058090', INTU: '0000089687',
  TGT: '0000027419', DECK: '0001367628', LULU: '0001397187',
  PLTR: '0001321655', UBER: '0001543151', SQ: '0001512673',
  SHOP: '0001444710', ROKU: '0001486118', DASH: '0001795145', ABNB: '0001559720',
  ARM: '0002033744', CRWD: '0001536123', ZS: '0001713445',
  SNOW: '0001640145', NET: '0001477720', DDOG: '0001567832', MDB: '0001495530',
  COIN: '0001679788', MSTR: '0001050446', RIOT: '0001167419', MARA: '0001507605',
  PLUG: '0001758439', SOFI: '0001819582', UPST: '0001808339',
};

const HIGH_IMPACT_FORMS = new Set([
  '8-K', '8-K/A', '10-K', '10-K/A', '10-Q', '10-Q/A',
  'SC 13G', 'SC 13D', 'SC 13G/A', 'SC 13D/A',
  'DEF 14A', 'DEFA14A', '144', '4', 'S-8',
]);

const filingCache = new Map<string, { filings: SECFiling[]; fetchedAt: number }>();
const FILING_TTL = 15 * 60 * 1000; // 15 min

function getCik(ticker: string): string | null {
  return TICKER_TO_CIK[ticker.toUpperCase()] || null;
}

export async function fetchSECFilings(ticker: string): Promise<SECFiling[]> {
  const cached = filingCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < FILING_TTL) return cached.filings;

  const cik = getCik(ticker);
  if (!cik) return [];

  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TradingDashboard/3.0 contact@example.com',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const recent = data?.filings?.recent;
    if (!recent) return [];

    const filings: SECFiling[] = [];
    const formTypes: string[] = recent.form || [];
    const filedDates: string[] = recent.filingDate || [];
    const descriptions: string[] = recent.primaryDocDescription || [];
    const accessions: string[] = recent.accessionNumber || [];

    for (let i = 0; i < Math.min(formTypes.length, 40); i++) {
      const form = formTypes[i];
      const filed = filedDates[i];
      const desc = descriptions[i] || '';
      const acc = (accessions[i] || '').replace(/-/g, '');
      const isHighImpact = HIGH_IMPACT_FORMS.has(form);

      // Only return recent filings (last 7 days)
      if (filed) {
        const filedDate = new Date(filed);
        const daysAgo = (Date.now() - filedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo > 7) continue;
      }

      filings.push({
        ticker,
        formType: form,
        filedAt: filed,
        description: desc,
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${form.toLowerCase()}-${acc}.htm`,
        isHighImpact,
      });
    }

    filingCache.set(ticker, { filings, fetchedAt: Date.now() });
    return filings;
  } catch {
    return [];
  }
}

/**
 * Scan multiple tickers for high-impact SEC filings.
 * Returns only 8-K, 10-K, insider trading (Form 4), and institutional changes.
 */
export async function scanHighImpactSECFilings(tickers: string[]): Promise<SECFiling[]> {
  const results: SECFiling[] = [];
  // Rate limit: max 3 concurrent requests to SEC
  for (let i = 0; i < tickers.length; i += 3) {
    const batch = tickers.slice(i, i + 3);
    const batchResults = await Promise.allSettled(batch.map(t => fetchSECFilings(t)));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(...r.value.filter(f => f.isHighImpact));
      }
    }
    if (i + 3 < tickers.length) {
      await new Promise(r => setTimeout(r, 350)); // SEC rate limit: 10/sec
    }
  }
  return results;
}

export function getCachedFilingStats(): { cachedTickers: number; totalFilings: number } {
  let total = 0;
  for (const { filings } of filingCache.values()) total += filings.length;
  return { cachedTickers: filingCache.size, totalFilings: total };
}
