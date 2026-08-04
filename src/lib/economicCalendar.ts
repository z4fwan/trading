/**
 * Global Economic Calendar — CPI, NFP, GDP, FOMC, ECB, BOJ, RBI rate decisions.
 * Uses ForexFactory free JSON proxy (no API key required).
 */

export interface EconomicEvent {
  id: string;
  title: string;
  country: string; // US, EU, GB, JP, IN, CN, etc.
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timestamp: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast?: string;
  previous?: string;
  actual?: string;
  category: string; // Interest Rate, Employment, Inflation, GDP, etc.
  isFOMC: boolean;
  isRateDecision: boolean;
}

const econCache = { events: [] as EconomicEvent[], fetchedAt: 0 };
const ECON_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ForexFactory free JSON proxy (community-maintained)
const FOREXFACTORY_PROXY = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FOREXFACTORY_NEXTWEEK = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';

const HIGH_IMPACT_KEYWORDS = [
  'fomc', 'fed rate', 'interest rate', 'non-farm', 'nfp', 'payroll',
  'cpi', 'inflation', 'gdp', 'unemployment', 'jobless', 'ism',
  'retail sales', 'ppi', 'core pce', 'ecb', 'boj', 'boe', 'rba',
  'rbi rate', 'mpc decision', 'fed chair', 'powell', 'draghi', 'ueda',
];

const RATE_DECISION_KEYWORDS = [
  'fomc', 'interest rate', 'rate decision', 'fed rate', 'ecb rate',
  'boj rate', 'boe rate', 'rba rate', 'rbi rate', 'mpc decision',
  'repo rate', 'monetary policy',
];

function isHighImpact(title: string, country: string): boolean {
  const lower = title.toLowerCase();
  if (country === 'US' && HIGH_IMPACT_KEYWORDS.some(k => lower.includes(k))) return true;
  if (country === 'EU' && ['ecb', 'interest rate', 'cpi', 'gdp', 'unemployment'].some(k => lower.includes(k))) return true;
  if (country === 'GB' && ['boe', 'interest rate', 'gdp', 'cpi', 'nfp'].some(k => lower.includes(k))) return true;
  if (country === 'JP' && ['boj', 'interest rate', 'gdp', 'cpi'].some(k => lower.includes(k))) return true;
  if (country === 'IN' && ['rbi', 'repo rate', 'gdp', 'cpi', 'mpc'].some(k => lower.includes(k))) return true;
  return false;
}

function isRateDecision(title: string): boolean {
  const lower = title.toLowerCase();
  return RATE_DECISION_KEYWORDS.some(k => lower.includes(k));
}

function isFOMCEvent(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes('fomc') || lower.includes('fed rate') || lower.includes('federal reserve');
}

async function fetchForexFactoryData(url: string): Promise<EconomicEvent[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((e: any) => e && e.title && e.country)
      .map((e: any): EconomicEvent => {
        const impact = e.impact === 3 || e.impact === 'High' || isHighImpact(e.title, e.country)
          ? 'HIGH'
          : e.impact === 2 || e.impact === 'Medium'
            ? 'MEDIUM' : 'LOW';

        return {
          id: `econ-${e.country}-${e.title?.slice(0, 30)}-${e.date || ''}`,
          title: e.title,
          country: e.country,
          date: e.date || '',
          time: e.time || '',
          timestamp: e.date ? new Date(`${e.date}T${e.time || '12:00'}`).getTime() : Date.now(),
          impact,
          forecast: e.forecast || undefined,
          previous: e.previous || undefined,
          actual: e.actual || undefined,
          category: e.category || 'Economic',
          isFOMC: isFOMCEvent(e.title),
          isRateDecision: isRateDecision(e.title),
        };
      })
      .filter((e: EconomicEvent) => e.date);
  } catch {
    return [];
  }
}

/**
 * Fetch this week + next week economic calendar.
 */
export async function fetchEconomicCalendar(): Promise<EconomicEvent[]> {
  const now = Date.now();
  if (econCache.events.length > 0 && now - econCache.fetchedAt < ECON_TTL) {
    return econCache.events;
  }

  const [thisWeek, nextWeek] = await Promise.all([
    fetchForexFactoryData(FOREXFACTORY_PROXY),
    fetchForexFactoryData(FOREXFACTORY_NEXTWEEK),
  ]);

  const all = [...thisWeek, ...nextWeek];
  // Deduplicate by id
  const seen = new Set<string>();
  const unique = all.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  econCache.events = unique;
  econCache.fetchedAt = now;
  return unique;
}

/**
 * Get high-impact events happening today or tomorrow.
 */
export async function getImminentHighImpactEvents(): Promise<EconomicEvent[]> {
  const all = await fetchEconomicCalendar();
  const now = Date.now();
  const tomorrow = now + 24 * 60 * 60 * 1000;

  return all.filter(e =>
    e.impact === 'HIGH' && e.timestamp >= now - 3600000 && e.timestamp <= tomorrow
  ).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get FOMC / rate decision events within N days.
 */
export async function getRateDecisions(withinDays = 14): Promise<EconomicEvent[]> {
  const all = await fetchEconomicCalendar();
  const now = Date.now();
  const cutoff = now + withinDays * 24 * 60 * 60 * 1000;

  return all.filter(e =>
    e.isRateDecision && e.timestamp >= now && e.timestamp <= cutoff
  ).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Check if there's a high-impact event today.
 */
export async function hasHighImpactEventToday(): Promise<boolean> {
  const all = await fetchEconomicCalendar();
  const today = new Date().toISOString().split('T')[0];
  return all.some(e => e.impact === 'HIGH' && e.date === today);
}

export function getEconCalendarStats(): { totalEvents: number; highImpact: number; rateDecisions: number } {
  const events = econCache.events;
  return {
    totalEvents: events.length,
    highImpact: events.filter(e => e.impact === 'HIGH').length,
    rateDecisions: events.filter(e => e.isRateDecision).length,
  };
}
