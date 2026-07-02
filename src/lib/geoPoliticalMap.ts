// Geopolitical & Macroeconomic Event Mapping — The Macro Brain
// Maps keywords to affected sectors, tickers, and market actions

export interface GeopoliticalImpact {
  id: string;
  keywords: string[];
  sectors: string[];
  tickers: string[];
  action: 'BULLISH' | 'BEARISH' | 'VOLATILE';
  affectedMarkets: string[];
  safeHavens: string[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export const GEOPOLITICAL_MAP: GeopoliticalImpact[] = [
  // Middle East / Oil Shock
  {
    id: 'oil-shock',
    keywords: ['iran', 'middle east', 'crude oil', 'opec', 'energy crisis', 'oil supply', 'gas crisis',
               'strait of hormuz', 'saudi arabia', 'gulf war', 'drone strike', 'missile strike'],
    sectors: ['Energy', 'Defense', 'Shipping'],
    tickers: ['CL=F', 'XLE', 'LMT', 'NOC', 'GD', 'XOM', 'CVX'],
    action: 'BULLISH',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'NIFTY_50'],
    safeHavens: ['GC=F', '^VIX', 'GLD'],
    severity: 'HIGH',
  },
  // Central Bank / Rate Decisions
  {
    id: 'rate-shock',
    keywords: ['emergency rate cut', 'emergency rate hike', 'surprise rate cut', 'surprise rate hike',
               'fomc decision', 'fed raises rates', 'fed cuts rates', 'jerome powell',
               'quantitative easing', 'quantitative tightening', 'basis points'],
    sectors: ['Financials', 'Real Estate', 'Technology'],
    tickers: ['SPY', 'QQQ', 'TLT', 'XLF'],
    action: 'VOLATILE',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'NIFTY_50', 'DX-Y.NYB'],
    safeHavens: ['GC=F', 'TLT'],
    severity: 'HIGH',
  },
  // Trade War / Tariffs
  {
    id: 'trade-war',
    keywords: ['tariff', 'trade war', 'trade dispute', 'import tax', 'duties',
               'trade deal', 'section 301', 'reciprocal tariff', 'trade barrier',
               'export control', 'sanctions'],
    sectors: ['Industrials', 'Consumer Goods', 'Technology'],
    tickers: ['XLI', 'XLP', 'CAT', 'DE'],
    action: 'BEARISH',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'EEM', 'NIFTY_50'],
    safeHavens: ['GC=F', '^VIX', 'TLT'],
    severity: 'HIGH',
  },
  // War / Armed Conflict
  {
    id: 'armed-conflict',
    keywords: ['war declared', 'military strike', 'nuclear', 'invasion',
               'armed conflict', 'declares war', 'hostilities', 'act of war',
               'terrorist attack', 'homeland security', 'mobilization'],
    sectors: ['Defense', 'Energy', 'Gold'],
    tickers: ['LMT', 'NOC', 'GD', 'XLE', 'GC=F', '^VIX'],
    action: 'BULLISH',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'EEM', 'NIFTY_50'],
    safeHavens: ['GC=F', '^VIX', 'USD'],
    severity: 'HIGH',
  },
  // Pandemic / Health Crisis
  {
    id: 'health-crisis',
    keywords: ['pandemic', 'lockdown', 'health emergency', 'virus outbreak',
               'quarantine', 'state of emergency', 'public health'],
    sectors: ['Healthcare', 'Technology', 'Consumer Staples'],
    tickers: ['XLV', 'XLK', 'XLP', 'AMZN', 'WMT'],
    action: 'VOLATILE',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'NIFTY_50'],
    safeHavens: ['TLT', 'GC=F', '^VIX'],
    severity: 'HIGH',
  },
  // Currency / Debt Crisis
  {
    id: 'currency-crisis',
    keywords: ['debt default', 'sovereign debt', 'currency crisis', 'banking crisis',
               'financial collapse', 'credit crunch', 'systemic risk', 'contagion',
               'debt ceiling', 'government shutdown', 'credit rating downgrade'],
    sectors: ['Financials', 'Real Estate'],
    tickers: ['XLF', 'TLT', 'HYG', 'SPY'],
    action: 'BEARISH',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'NIFTY_50', 'DX-Y.NYB'],
    safeHavens: ['GC=F', '^VIX', 'USD'],
    severity: 'HIGH',
  },
  // Geopolitical Escalation
  {
    id: 'geopolitical-escalation',
    keywords: ['nato', 'putin', 'xi jinping', 'south china sea', 'taiwan',
               'ukraine', 'russia', 'nuclear threat', 'escalation', 'retaliation'],
    sectors: ['Defense', 'Energy'],
    tickers: ['LMT', 'NOC', 'XLE', 'GC=F', '^VIX', 'SPY'],
    action: 'VOLATILE',
    affectedMarkets: ['SPY', 'QQQ', '^NSEI', 'NIFTY_50', 'EEM'],
    safeHavens: ['GC=F', '^VIX', 'USD'],
    severity: 'MEDIUM',
  },
];

/** India-specific macro events (RBI, NSE, rupee, FII, policy). */
export const INDIAN_MACRO_MAP: GeopoliticalImpact[] = [
  {
    id: 'india-rbi-policy',
    keywords: [
      'reserve bank of india', 'rbi governor', 'rbi raises', 'rbi cuts', 'rbi holds',
      'repo rate', 'reverse repo', 'mpc decision', 'monetary policy committee',
      'crr ', 'slr ', 'liquidity adjustment facility', 'laf ', 'standing deposit facility',
      'emergency rate', 'surprise rate cut india', 'surprise rate hike india',
    ],
    sectors: ['Banking', 'Financials', 'NBFC'],
    tickers: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK', 'BAJFINANCE', 'SHRIRAMFIN'],
    action: 'VOLATILE',
    affectedMarkets: ['^NSEI', 'NIFTY_50', 'BANKNIFTY'],
    safeHavens: ['ITC', 'HINDUNILVR', 'GC=F'],
    severity: 'HIGH',
  },
  {
    id: 'india-market-shock',
    keywords: [
      'nifty crash', 'sensex crash', 'nifty plunges', 'sensex plunges',
      'circuit breaker', 'upper circuit', 'lower circuit', 'market halt india',
      'fii selling', 'fii outflow', 'fpi outflow', 'foreign investors sell india',
      'rupee falls', 'rupee weakens', 'rupee hits record', 'inr depreciates',
      'adani group', 'hindenburg', 'shell company india',
    ],
    sectors: ['Broad Market', 'Banking', 'Energy'],
    tickers: ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ADANIENT', 'ONGC', 'TATASTEEL'],
    action: 'BEARISH',
    affectedMarkets: ['^NSEI', 'NIFTY_50', 'BANKNIFTY'],
    safeHavens: ['ITC', 'HINDUNILVR', 'SUNPHARMA', 'GC=F'],
    severity: 'HIGH',
  },
  {
    id: 'india-fiscal-policy',
    keywords: [
      'union budget', 'interim budget india', 'finance minister', 'fiscal deficit india',
      'gst council', 'gst rate', 'direct tax india', 'capital gains tax india',
      'sebi ban', 'sebi probe', 'sebi penalty', 'sebi circular',
    ],
    sectors: ['Policy', 'Consumption', 'Infrastructure'],
    tickers: ['RELIANCE', 'LT', 'ITC', 'MARUTI', 'TCS', 'INFY'],
    action: 'VOLATILE',
    affectedMarkets: ['^NSEI', 'NIFTY_50'],
    safeHavens: ['ITC', 'HINDUNILVR'],
    severity: 'HIGH',
  },
  {
    id: 'india-crude-impact',
    keywords: [
      'crude oil india', 'india oil import', 'fuel price india', 'petrol diesel price',
      'omc stocks', 'under-recovery', 'india inflation cpi', 'wpi india',
    ],
    sectors: ['Energy', 'OMCs', 'Aviation'],
    tickers: ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'NTPC', 'POWERGRID'],
    action: 'VOLATILE',
    affectedMarkets: ['^NSEI', 'NIFTY_50'],
    safeHavens: ['ITC', 'TECHM'],
    severity: 'MEDIUM',
  },
  {
    id: 'india-border-risk',
    keywords: [
      'india pakistan', 'loc firing', 'ladakh', 'galwan', 'india china border',
      'border tension india', 'ceasefire violation', 'surgical strike',
    ],
    sectors: ['Defense', 'Energy'],
    tickers: ['LT', 'RELIANCE', 'ONGC', 'TATASTEEL', 'COALINDIA'],
    action: 'VOLATILE',
    affectedMarkets: ['^NSEI', 'NIFTY_50'],
    safeHavens: ['ITC', 'HINDUNILVR', 'GC=F'],
    severity: 'HIGH',
  },
];

function matchFromMap(text: string, map: GeopoliticalImpact[]): GeopoliticalImpact[] {
  const matches: GeopoliticalImpact[] = [];
  for (const entry of map) {
    for (const kw of entry.keywords) {
      if (text.includes(kw.toLowerCase())) {
        matches.push(entry);
        break;
      }
    }
  }
  return matches;
}

export function matchGeopoliticalEvent(headline: string, summary?: string): GeopoliticalImpact[] {
  const text = `${headline} ${summary || ''}`.toLowerCase();
  return matchFromMap(text, GEOPOLITICAL_MAP);
}

export function matchIndianMacroEvent(headline: string, summary?: string): GeopoliticalImpact[] {
  const text = `${headline} ${summary || ''}`.toLowerCase();
  return matchFromMap(text, INDIAN_MACRO_MAP);
}

/** Global + India macro keyword matches (deduped by id). */
export function matchAllMacroEvents(headline: string, summary?: string): GeopoliticalImpact[] {
  const seen = new Set<string>();
  const out: GeopoliticalImpact[] = [];
  for (const m of [...matchGeopoliticalEvent(headline, summary), ...matchIndianMacroEvent(headline, summary)]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function getAffectedTickers(impacts: GeopoliticalImpact[]): string[] {
  return [...new Set(impacts.flatMap(i => i.tickers))];
}

export function getSafeHavenTickers(impacts: GeopoliticalImpact[]): string[] {
  return [...new Set(impacts.flatMap(i => i.safeHavens))];
}

export function getVetoedTickers(impacts: GeopoliticalImpact[]): string[] {
  return [...new Set(impacts.flatMap(i => i.affectedMarkets))];
}

export function getMacroShockSeverity(impacts: GeopoliticalImpact[]): 'PANIC' | 'HIGH_VOLATILITY' {
  if (impacts.some(i => i.severity === 'HIGH' && i.id === 'armed-conflict')) return 'PANIC';
  if (impacts.some(i => i.severity === 'HIGH' && i.id === 'india-market-shock')) return 'PANIC';
  if (impacts.some(i => i.severity === 'HIGH' && (i.action === 'BEARISH' || i.action === 'BULLISH'))) return 'HIGH_VOLATILITY';
  return 'HIGH_VOLATILITY';
}
