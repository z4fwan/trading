/**
 * Seasonal / Thematic Demand Engine — HEURISTIC, not a validated prediction.
 *
 * Maps recurring Indian demand drivers (monsoon, floods, summer cooling, festive
 * & wedding consumption, harvest, govt capex) to sectors/listed beneficiaries,
 * then scores each theme by:
 *   - calendar match (is the theme's season active now?), and
 *   - live weather (Open-Meteo, free, no key) for the weather-sensitive themes.
 *
 * READ THIS: this outputs a *watchlist with reasoning*, not a forecast. The
 * sector→stock links are conventional demand patterns; "demand over supply" here
 * means "seasonally elevated demand", NOT measured supply data. It is labelled
 * HEURISTIC everywhere it surfaces. Not financial advice.
 */

import { getTickerName } from './marketConfig';

export interface ThematicBeneficiary {
  ticker: string;
  name: string;
  reason: string;
}

export interface SeasonalThemeDef {
  id: string;
  name: string;
  season: string;
  activeMonths: number[]; // 0=Jan … 11=Dec (IST)
  trigger: string;
  weatherSensitive?: 'monsoon' | 'flood';
  beneficiaries: ThematicBeneficiary[];
}

export interface ScoredTheme extends SeasonalThemeDef {
  calendarMatch: number; // 0-1
  weatherBoost: number; // 0-1
  score: number; // 0-100 (heuristic)
  active: boolean;
  note: string;
}

export interface WeatherSnapshot {
  city: string;
  rainfall7dMm: number;
  maxDailyMm: number;
  floodRisk: boolean;
}

export interface SeasonalReport {
  generatedAt: number;
  monthName: string;
  monthIndex: number;
  weather: WeatherSnapshot[];
  themes: ScoredTheme[];
  disclaimer: string;
}

const DISCLAIMER =
  'HEURISTIC seasonal/thematic watchlist — NOT a validated prediction and NOT financial advice. ' +
  'Sector/stock links are conventional demand patterns, not measured supply data or guarantees.';

function B(ticker: string, reason: string): ThematicBeneficiary {
  return { ticker, name: getTickerName(ticker), reason };
}

/** Recurring India demand themes. Months are IST (0=Jan). */
export const SEASONAL_THEMES: SeasonalThemeDef[] = [
  {
    id: 'monsoon-agri',
    name: 'Monsoon / Kharif Rural Demand',
    season: 'Jun–Sep',
    activeMonths: [5, 6, 7, 8],
    trigger: 'Southwest monsoon active — soil moisture, sowing, rural cash flows rise',
    weatherSensitive: 'monsoon',
    beneficiaries: [
      B('M&M', 'Tractor & farm-equipment volumes track monsoon sowing'),
      B('ESCORTS', 'Tractor demand tied to kharif sowing'),
      B('COROMANDEL', 'Fertiliser/agrochem volumes rise with sowing'),
      B('CHAMBLFERT', 'Fertiliser demand in kharif season'),
      B('GNFC', 'Fertiliser (urea) seasonal demand'),
      B('PIIND', 'Agrochem / crop-protection seasonal demand'),
      B('UPL', 'Crop-protection volumes in monsoon'),
      B('SUMICHEM', 'Agrochem seasonal offtake'),
      B('KSB', 'Irrigation pumps demand'),
      B('KIRLOSENG', 'Pumps & engines for irrigation'),
      B('DABUR', 'Rural FMCG demand as farm incomes improve'),
      B('HINDUNILVR', 'Rural FMCG volume recovery in good monsoon'),
    ],
  },
  {
    id: 'flood-relief',
    name: 'Excess Rain / Flood Relief',
    season: 'Jul–Sep',
    activeMonths: [6, 7, 8],
    trigger: 'Heavy rainfall / flood alerts — pumps, repair, insurance claims',
    weatherSensitive: 'flood',
    beneficiaries: [
      B('KSB', 'Dewatering / flood-relief pumps'),
      B('KIRLOSENG', 'Pumps & gensets for flood response'),
      B('CROMPTON', 'Pumps, fans, small appliances'),
      B('HAVELLS', 'Electricals, pumps and repair demand'),
      B('ULTRACEMCO', 'Cement for reconstruction/repairs'),
      B('AMBUJACEM', 'Cement for reconstruction/repairs'),
      B('ICICIGI', 'General insurance claims cycle (net effect varies)'),
      B('LICI', 'Insurance activity around disaster claims'),
    ],
  },
  {
    id: 'summer-cooling',
    name: 'Summer Cooling & Beverages',
    season: 'Mar–Jun',
    activeMonths: [2, 3, 4, 5],
    trigger: 'Peak summer heat — cooling appliances and cold beverages',
    beneficiaries: [
      B('VOLTAS', 'Air-conditioner demand peaks in summer'),
      B('BLUESTARCO', 'AC/cooling products seasonal peak'),
      B('CROMPTON', 'Fans, coolers, appliances'),
      B('HAVELLS', 'Fans, coolers, electricals'),
      B('WHIRLPOOL', 'Refrigeration/appliances'),
      B('VBL', 'Beverages volume peaks in summer'),
      B('TATACONSUM', 'Beverages/FMCG summer demand'),
      B('NTPC', 'Power demand peaks with cooling load'),
      B('TATAPOWER', 'Peak summer electricity demand'),
      B('ADANIPOWER', 'Peak summer electricity demand'),
    ],
  },
  {
    id: 'winter-demand',
    name: 'Winter Heating & Warm FMCG',
    season: 'Nov–Feb',
    activeMonths: [10, 11, 0, 1],
    trigger: 'Winter — room heaters and hot-beverage consumption',
    beneficiaries: [
      B('HAVELLS', 'Room heaters / winter appliances'),
      B('CROMPTON', 'Heaters & small appliances'),
      B('BAJAJELEC', 'Heaters & small appliances'),
      B('TATACONSUM', 'Tea/coffee hot-beverage demand'),
      B('NESTLEIND', 'Hot beverages / FMCG winter demand'),
    ],
  },
  {
    id: 'festive-consumption',
    name: 'Festive Consumption',
    season: 'Sep–Nov',
    activeMonths: [8, 9, 10],
    trigger: 'Festive season — jewellery, autos, durables, paints, retail',
    beneficiaries: [
      B('TITAN', 'Jewellery & watches festive demand'),
      B('KALYANKJIL', 'Jewellery festive/wedding demand'),
      B('RAJESHEXPO', 'Jewellery exports/retail seasonal'),
      B('MARUTI', 'Auto purchases peak in festive season'),
      B('M&M', 'Auto/SUV festive demand'),
      B('TATAMOTORS', 'Auto festive demand'),
      B('BAJAJ-AUTO', 'Two/three-wheeler festive demand'),
      B('HEROMOTOCO', 'Two-wheeler festive demand'),
      B('TVSMOTOR', 'Two-wheeler festive demand'),
      B('ASIANPAINT', 'Painting/repaint demand in festive season'),
      B('BERGEPAINT', 'Paint demand festive season'),
      B('DIXON', 'Consumer electronics/durables festive demand'),
      B('TRENT', 'Retail/apparel festive footfall'),
      B('ETERNAL', 'Online food/quick-commerce festive demand'),
    ],
  },
  {
    id: 'wedding-season',
    name: 'Wedding Season (Nov–Feb)',
    season: 'Nov–Feb',
    activeMonths: [10, 11, 0, 1],
    trigger: 'Peak wedding dates — jewellery, apparel, autos, hotels',
    beneficiaries: [
      B('TITAN', 'Jewellery gifting in weddings'),
      B('KALYANKJIL', 'Wedding jewellery demand'),
      B('RAJESHEXPO', 'Jewellery seasonal demand'),
      B('TRENT', 'Apparel/retail for wedding season'),
      B('PAGEIND', 'Apparel volumes'),
      B('INDHOTEL', 'Hotels/weddings & events'),
      B('MARUTI', 'Cars as wedding purchases'),
      B('M&M', 'Cars/SUVs as wedding purchases'),
    ],
  },
  {
    id: 'rural-harvest',
    name: 'Rural Harvest Cash Flow',
    season: 'Oct–Jan',
    activeMonths: [9, 10, 11, 0],
    trigger: 'Kharif harvest — rural cash flow, two-wheeler & agrochem offtake',
    beneficiaries: [
      B('PIIND', 'Agrochem post-harvest/rabi demand'),
      B('UPL', 'Agrochem rabi season'),
      B('COROMANDEL', 'Rabi fertiliser demand'),
      B('M&M', 'Tractor & rural auto demand post-harvest'),
      B('ESCORTS', 'Tractor demand post-harvest'),
      B('HEROMOTOCO', 'Two-wheeler rural demand'),
      B('TVSMOTOR', 'Two-wheeler rural demand'),
      B('DABUR', 'Rural FMCG spend after harvest'),
    ],
  },
  {
    id: 'govt-capex',
    name: 'Govt Capex / Pre-Budget Infra',
    season: 'Jan–Mar',
    activeMonths: [0, 1, 2],
    trigger: 'Budget season — infra & defence ordering expectations',
    beneficiaries: [
      B('LT', 'Infra/EPC order pipeline'),
      B('RVNL', 'Railway capex execution'),
      B('IRCON', 'Rail/infra project awards'),
      B('BEL', 'Defence electronics orders'),
      B('HAL', 'Defence aviation orders'),
      B('BDL', 'Missile/defence orders'),
    ],
  },
];

const CITIES: { city: string; lat: number; lon: number; agri?: boolean }[] = [
  { city: 'Mumbai', lat: 19.076, lon: 72.877 },
  { city: 'Delhi', lat: 28.704, lon: 77.102 },
  { city: 'Kolkata', lat: 22.573, lon: 88.364 },
  { city: 'Chennai', lat: 13.083, lon: 80.271 },
  { city: 'Bengaluru', lat: 12.972, lon: 77.594 },
  { city: 'Hyderabad', lat: 17.385, lon: 78.487 },
  { city: 'Nagpur (agri belt)', lat: 21.146, lon: 79.088, agri: true },
  { city: 'Lucknow (agri belt)', lat: 26.847, lon: 80.947, agri: true },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function istMonthIndex(): number {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getMonth();
}

interface OpenMeteoDaily {
  daily?: { precipitation_sum?: Array<number | null> };
}

async function fetchWeather(timeoutMs = 9000): Promise<WeatherSnapshot[]> {
  const lat = CITIES.map((c) => c.lat).join(',');
  const lon = CITIES.map((c) => c.lon).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum&forecast_days=7&timezone=Asia%2FKolkata`;
  let json: OpenMeteoDaily | OpenMeteoDaily[];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }
  const rows = Array.isArray(json) ? json : [json];
  const out: WeatherSnapshot[] = [];
  rows.forEach((row, i) => {
    const city = CITIES[i]?.city ?? `Location ${i}`;
    const arr = (row?.daily?.precipitation_sum ?? []).filter((v): v is number => typeof v === 'number');
    if (arr.length === 0) {
      out.push({ city, rainfall7dMm: 0, maxDailyMm: 0, floodRisk: false });
      return;
    }
    const rainfall7dMm = parseFloat(arr.reduce((a, b) => a + b, 0).toFixed(1));
    const maxDailyMm = parseFloat(Math.max(...arr).toFixed(1));
    out.push({ city, rainfall7dMm, maxDailyMm, floodRisk: maxDailyMm >= 80 || rainfall7dMm >= 200 });
  });
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function scoreTheme(
  def: SeasonalThemeDef,
  monthIndex: number,
  weather: WeatherSnapshot[],
): ScoredTheme {
  const calendarMatch = def.activeMonths.includes(monthIndex)
    ? 1
    : def.activeMonths.some((m) => Math.abs(m - monthIndex) === 1 || Math.abs(m - monthIndex) === 11)
      ? 0.35
      : 0;

  let weatherBoost = 0.6; // calendar-driven themes get a neutral base
  if (weather.length > 0) {
    const avgRain = weather.reduce((a, w) => a + w.rainfall7dMm, 0) / weather.length;
    const anyFlood = weather.some((w) => w.floodRisk);
    const agriRain =
      weather.filter((w) => w.city.includes('agri')).reduce((a, w) => a + w.rainfall7dMm, 0) /
      Math.max(1, weather.filter((w) => w.city.includes('agri')).length);
    if (def.weatherSensitive === 'monsoon') {
      weatherBoost = clamp01(agriRain / 120);
    } else if (def.weatherSensitive === 'flood') {
      weatherBoost = anyFlood ? 0.95 : clamp01(avgRain / 150) * 0.6;
    }
  }

  const score = Math.round(calendarMatch * 70 + weatherBoost * 30);
  const active = calendarMatch >= 1;

  let note: string;
  if (def.weatherSensitive === 'flood') {
    const anyFlood = weather.some((w) => w.floodRisk);
    note = anyFlood ? 'Flood-risk rainfall detected — theme live' : 'No flood-risk rainfall in the 7-day outlook';
  } else if (def.weatherSensitive === 'monsoon') {
    note = weather.length ? 'Scored on agri-belt rainfall vs monsoon norm' : 'Weather unavailable — calendar-only score';
  } else {
    note = active ? 'Active by calendar season' : 'Outside its season window';
  }

  return { ...def, calendarMatch, weatherBoost: parseFloat(weatherBoost.toFixed(2)), score, active, note };
}

let reportCache: { report: SeasonalReport; at: number } | null = null;
const REPORT_TTL = 60 * 60 * 1000;

export async function buildSeasonalReport(force = false): Promise<SeasonalReport> {
  if (!force && reportCache && Date.now() - reportCache.at < REPORT_TTL) return reportCache.report;
  const monthIndex = istMonthIndex();
  const weather = await fetchWeather();
  const themes = SEASONAL_THEMES.map((d) => scoreTheme(d, monthIndex, weather)).sort((a, b) => b.score - a.score);
  const report: SeasonalReport = {
    generatedAt: Date.now(),
    monthName: MONTH_NAMES[monthIndex],
    monthIndex,
    weather,
    themes,
    disclaimer: DISCLAIMER,
  };
  reportCache = { report, at: Date.now() };
  return report;
}

/** Compact plain-text block for Telegram / email. */
export function formatSeasonalReport(report: SeasonalReport, maxThemes = 3): string {
  const lines: string[] = [];
  lines.push(`SEASONAL/THEMATIC WATCHLIST — ${report.monthName}`);
  const flood = report.weather.filter((w) => w.floodRisk).map((w) => w.city);
  if (report.weather.length) {
    lines.push(
      `7-day rain: ${report.weather
        .slice(0, 5)
        .map((w) => `${w.city.split(' ')[0]} ${w.rainfall7dMm}mm`)
        .join(', ')}`,
    );
  }
  if (flood.length) lines.push(`Flood-risk: ${flood.join(', ')}`);
  for (const t of report.themes.filter((x) => x.active).slice(0, maxThemes)) {
    lines.push('');
    lines.push(`• ${t.name} [${t.season}] — score ${t.score}/100 (heuristic)`);
    lines.push(`  ${t.trigger}`);
    lines.push(`  Watch: ${t.beneficiaries.slice(0, 8).map((b) => b.ticker).join(', ')}`);
  }
  lines.push('');
  lines.push(report.disclaimer);
  return lines.join('\n');
}
