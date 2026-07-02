// Elite Source Whitelist — Tier-1 Geopolitical & Macroeconomic Intelligence
// Only these sources can trigger MACRO_SHOCK events
//
// Live intake: free official RSS + Google News (see eliteOfficialFeeds.ts).
// Paid X/Twitter API is intentionally not used.

export const ELITE_TWITTER_HANDLES = [
  '@POTUS', '@WhiteHouse', '@StateDept', '@SecBlinken',
  '@FederalReserve', '@SecYellen', '@USTreasury',
  '@OPECSecretariat', '@ECB', '@IMFNews', '@WorldBank',
  '@WTO', '@NATO', '@UN', '@PENTAGON',
];

export const ELITE_NEWS_DOMAINS = [
  'bloomberg.com', 'reuters.com', 'wsj.com',
  'ft.com', 'economist.com', 'nytimes.com',
  'cnbc.com', 'bbc.com', 'apnews.com', 'politico.com',
  'axios.com', 'theintercept.com',
];

/** Tier-1 Indian macro / market authorities and financial press */
export const INDIAN_ELITE_HANDLES = [
  '@RBI', '@SEBI_India', '@PIB_India',
];

export const INDIAN_ELITE_DOMAINS = [
  'rbi.org.in', 'sebi.gov.in', 'pib.gov.in',
  'economictimes.indiatimes.com', 'moneycontrol.com', 'livemint.com',
  'business-standard.com', 'financialexpress.com', 'ndtv.com',
];

const INDIAN_ELITE_NAME_PATTERNS = [
  /^Moneycontrol$/i,
  /^Economic Times$/i,
  /^Livemint$/i,
  /^Business Standard$/i,
  /^Financial Express$/i,
  /^Reuters India$/i,
  /^NDTV Profit$/i,
  /^Google News India$/i,
  ...INDIAN_ELITE_HANDLES.map(h => new RegExp(`^${h}$`, 'i')),
  ...INDIAN_ELITE_DOMAINS.map(d => new RegExp(d.replace('.', '\\.'), 'i')),
];

// Patterns to match against source/provider strings
export const ELITE_SOURCE_PATTERNS = [
  ...ELITE_TWITTER_HANDLES.map(h => new RegExp(`^${h}$`, 'i')),
  ...ELITE_NEWS_DOMAINS.map(d => new RegExp(d.replace('.', '\\.'), 'i')),
  // Also match provider names
  /^Reuters$/i, /^Bloomberg$/i, /^Wall Street Journal$/i,
  /^Financial Times$/i, /^CNBC$/i, /^BBC News$/i,
  /^Associated Press$/i, /^The New York Times$/i,
  /^The Economist$/i, /^Axios$/i, /^Politico$/i,
];

export function isEliteSource(source: string): boolean {
  if (!source) return false;
  return ELITE_SOURCE_PATTERNS.some(p => p.test(source));
}

export function isIndianEliteSource(source: string): boolean {
  if (!source) return false;
  return INDIAN_ELITE_NAME_PATTERNS.some(p => p.test(source));
}

/** Global or Indian authority / financial press — can trigger tier-1 macro. */
export function isTier1MacroSource(source: string): boolean {
  return isEliteSource(source) || isIndianEliteSource(source);
}
