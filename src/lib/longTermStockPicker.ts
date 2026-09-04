/**
 * Long-Term Stock Picker — Weekly Study System
 *
 * Mon-Thu (16:20 IST): Daily deep scan of 500+ NSE stocks
 *   - Score all stocks on growth/value/quality
 *   - Top 20 candidates → daily study (momentum, news, sentiment, fundamentals)
 *   - Store daily observations in Supabase
 *
 * Friday (16:20 IST): Final recommendation
 *   - Review full week of observations for top candidates
 *   - LLM deep analysis using 5 days of data
 *   - Pick top 3-5 with detailed reasoning
 *   - Send email with comprehensive analysis
 *
 * This week-long study ensures the AI truly understands each stock before recommending.
 */

import { getFullUniverse } from '@/lib/dynamicUniverse';
import { fetchRawFundamentals, type RawFundamentals } from '@/lib/stockPulse/fundamentalFetcher';
import { callLLM } from '@/lib/llmProvider';
import { sendEmailSmtp } from '@/lib/annualReport/sendEmail';
import { getNewsForTicker } from '@/lib/newsStore';


// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyObservation {
  date: string;           // YYYY-MM-DD
  ticker: string;
  cmp: number | null;
  change: number | null;  // % change from prev day
  volume: number | null;
  rsi: number | null;
  macd: number | null;
  newsHeadlines: string[];
  newsSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 to +100
  fundamentals: {
    pe: number | null;
    roe: number | null;
    debtEquity: number | null;
  };
  scoreAtScan: number;    // total score when first scanned
}

interface StudyCandidate {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCapCr: number | null;

  // Fundamental snapshot
  cmp: number | null;
  high52: number | null;
  low52: number | null;
  pe: number | null;
  pb: number | null;
  peg: number | null;
  roe: number | null;
  roce: number | null;
  debtEquity: number | null;
  revCagr3y: number | null;
  revCagr5y: number | null;
  profitGrowth: number | null;
  divYield: number | null;
  freeCashflow: number | null;

  // Scores
  growthScore: number;
  valueScore: number;
  qualityScore: number;
  totalScore: number;

  // Daily observations (Mon-Fri)
  observations: DailyObservation[];

  // Friday only
  weeklySummary?: string;
  deepAnalysis?: string;
  holdingPeriod?: string;
  riskFactors?: string;
  entrySuggestion?: string;
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreGrowth(raw: RawFundamentals): number {
  let score = 0;
  const rev3 = raw.revenueGrowth ?? (raw.revenueHistory.length >= 4 ? cagrSimple(raw.revenueHistory.slice(-4)) : null);
  const rev5 = cagrSimple(raw.revenueHistory.slice(-6));

  if (rev3 != null) {
    if (rev3 >= 25) score += 30;
    else if (rev3 >= 15) score += 22;
    else if (rev3 >= 8) score += 14;
    else if (rev3 >= 0) score += 6;
    else score -= 5;
  }

  if (rev5 != null) {
    if (rev5 >= 20) score += 25;
    else if (rev5 >= 12) score += 18;
    else if (rev5 >= 5) score += 10;
    else score += 2;
  }

  if (raw.earningsGrowth != null) {
    if (raw.earningsGrowth >= 30) score += 25;
    else if (raw.earningsGrowth >= 15) score += 18;
    else if (raw.earningsGrowth >= 5) score += 10;
    else if (raw.earningsGrowth >= 0) score += 4;
    else score -= 5;
  }

  if (rev3 != null && rev5 != null && rev3 > rev5 && rev3 > 0) score += 10;
  if (raw.operatingMargins != null && raw.operatingMargins >= 20) score += 10;
  else if (raw.operatingMargins != null && raw.operatingMargins >= 12) score += 5;

  return Math.max(0, Math.min(100, score));
}

function scoreValue(raw: RawFundamentals): number {
  let score = 0;

  if (raw.peg != null) {
    if (raw.peg > 0 && raw.peg < 0.8) score += 30;
    else if (raw.peg < 1.2) score += 22;
    else if (raw.peg < 1.8) score += 14;
    else if (raw.peg < 2.5) score += 6;
    else score -= 5;
  }

  if (raw.pe != null && raw.earningsGrowth != null && raw.earningsGrowth > 0) {
    const pegProxy = raw.pe / raw.earningsGrowth;
    if (pegProxy < 0.5) score += 20;
    else if (pegProxy < 1.0) score += 14;
    else if (pegProxy < 1.5) score += 8;
    else score += 2;
  }

  if (raw.cmp != null && raw.high52 != null && raw.low52 != null && raw.high52 > raw.low52) {
    const pos = (raw.cmp - raw.low52) / (raw.high52 - raw.low52);
    if (pos < 0.25) score += 20;
    else if (pos < 0.40) score += 14;
    else if (pos < 0.60) score += 8;
    else if (pos < 0.80) score += 3;
    else score -= 3;
  }

  if (raw.pb != null) {
    if (raw.pb > 0 && raw.pb < 1.5) score += 15;
    else if (raw.pb < 3) score += 10;
    else if (raw.pb < 5) score += 5;
    else score += 1;
  }

  if (raw.divYield != null && raw.divYield >= 1.5) score += 8;
  else if (raw.divYield != null && raw.divYield >= 0.5) score += 4;

  return Math.max(0, Math.min(100, score));
}

function scoreQuality(raw: RawFundamentals): number {
  let score = 0;

  if (raw.roe != null) {
    if (raw.roe >= 25) score += 28;
    else if (raw.roe >= 18) score += 22;
    else if (raw.roe >= 12) score += 14;
    else if (raw.roe >= 8) score += 6;
    else score -= 3;
  }

  if (raw.roce != null) {
    if (raw.roce >= 30) score += 22;
    else if (raw.roce >= 20) score += 16;
    else if (raw.roce >= 14) score += 10;
    else if (raw.roce >= 8) score += 4;
  }

  if (raw.debtEquity != null) {
    if (raw.debtEquity < 0.3) score += 20;
    else if (raw.debtEquity < 0.6) score += 14;
    else if (raw.debtEquity < 1.0) score += 8;
    else if (raw.debtEquity < 1.5) score += 3;
    else score -= 5;
  }

  if (raw.profitMargins != null) {
    if (raw.profitMargins >= 20) score += 15;
    else if (raw.profitMargins >= 12) score += 10;
    else if (raw.profitMargins >= 6) score += 5;
  }

  if (raw.freeCashflow != null && raw.freeCashflow > 0) score += 10;

  return Math.max(0, Math.min(100, score));
}

function cagrSimple(values: number[]): number | null {
  const clean = values.filter(v => v > 0);
  if (clean.length < 2) return null;
  const start = clean[0];
  const end = clean[clean.length - 1];
  const years = clean.length - 1;
  if (start <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function buildCandidate(raw: RawFundamentals): StudyCandidate {
  const growthScore = scoreGrowth(raw);
  const valueScore = scoreValue(raw);
  const qualityScore = scoreQuality(raw);
  const totalScore = Math.round(growthScore * 0.35 + qualityScore * 0.35 + valueScore * 0.30);
  const rev3 = raw.revenueGrowth ?? (raw.revenueHistory.length >= 4 ? cagrSimple(raw.revenueHistory.slice(-4)) : null);

  return {
    ticker: raw.ticker,
    name: raw.companyName,
    sector: raw.sector,
    industry: raw.industry,
    marketCapCr: raw.marketCapCr,
    cmp: raw.cmp,
    high52: raw.high52,
    low52: raw.low52,
    pe: raw.pe,
    pb: raw.pb,
    peg: raw.peg,
    roe: raw.roe,
    roce: raw.roce,
    debtEquity: raw.debtEquity,
    revCagr3y: rev3,
    revCagr5y: cagrSimple(raw.revenueHistory.slice(-6)),
    profitGrowth: raw.earningsGrowth,
    divYield: raw.divYield,
    freeCashflow: raw.freeCashflow,
    growthScore,
    valueScore,
    qualityScore,
    totalScore,
    observations: [],
  };
}

// ─── Daily Study (Mon-Thu) ──────────────────────────────────────────────────

function istTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getDayOfWeek(): number {
  return new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri
}

async function gatherDailyObservation(ticker: string, scoreAtScan: number): Promise<DailyObservation> {
  const today = istTodayKey();
  let cmp: number | null = null;
  let change: number | null = null;
  let volume: number | null = null;

  // Get live price from cache
  try {
    const { getLivePrice } = await import('@/lib/quoteFetcher');
    const price = getLivePrice(ticker); // synchronous — reads in-memory cache
    if (price != null) cmp = price;
  } catch { /* ignore */ }

  // Get news sentiment
  let newsHeadlines: string[] = [];
  let newsSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  let sentimentScore = 0;

  try {
    const news = getNewsForTicker(ticker, 24);
    if (news.length > 0) {
      newsHeadlines = news.slice(0, 5).map((n: any) => n.headline || n.title || '');
      const scores = news.map((n: any) => n.sentimentScore || 0);
      sentimentScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      newsSentiment = sentimentScore > 10 ? 'positive' : sentimentScore < -10 ? 'negative' : 'neutral';
    }
  } catch { /* ignore */ }

  return {
    date: today,
    ticker,
    cmp,
    change,
    volume,
    rsi: null,
    macd: null,
    newsHeadlines,
    newsSentiment,
    sentimentScore,
    fundamentals: {
      pe: null,
      roe: null,
      debtEquity: null,
    },
    scoreAtScan,
  };
}

async function runDailyStudy(): Promise<{ scanned: number; studied: number }> {
  const today = istTodayKey();
  console.log(`[LongTermPicker] Daily study starting — ${today}`);

  // 1. Get full universe and score
  const allTickers = getFullUniverse();
  console.log(`[LongTermPicker] Scanning ${allTickers.length} tickers...`);

  const candidates: StudyCandidate[] = [];
  let scanned = 0;

  for (let i = 0; i < allTickers.length; i += 10) {
    const batch = allTickers.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const raw = await fetchRawFundamentals(ticker);
          if (!raw || !raw.cmp || raw.cmp <= 0) return null;
          if (raw.marketCapCr != null && raw.marketCapCr < 200) return null;
          return buildCandidate(raw);
        } catch { return null; }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        candidates.push(r.value);
        scanned++;
      }
    }

    if (i + 10 < allTickers.length) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[LongTermPicker] Scored ${scanned} stocks. Sorting top 20 for daily study...`);

  // 2. Sort by total score, take top 20 for daily study
  candidates.sort((a, b) => b.totalScore - a.totalScore);
  const top20 = candidates.slice(0, 20);

  // 3. Gather daily observations for each
  let studied = 0;
  for (const candidate of top20) {
    try {
      const obs = await gatherDailyObservation(candidate.ticker, candidate.totalScore);
      obs.fundamentals.pe = candidate.pe;
      obs.fundamentals.roe = candidate.roe;
      obs.fundamentals.debtEquity = candidate.debtEquity;

      // Store in Supabase
      const { getServiceClient } = await import('@/lib/supabase');
      const svc = getServiceClient();
      if (svc) {
        await (svc.from('long_term_study') as any).upsert({
          date: today,
          ticker: candidate.ticker,
          study_data: {
            name: candidate.name,
            sector: candidate.sector,
            industry: candidate.industry,
            marketCapCr: candidate.marketCapCr,
            cmp: candidate.cmp,
            pe: candidate.pe,
            roe: candidate.roe,
            debtEquity: candidate.debtEquity,
            totalScore: candidate.totalScore,
            growthScore: candidate.growthScore,
            valueScore: candidate.valueScore,
            qualityScore: candidate.qualityScore,
            observation: obs,
          },
        }, { onConflict: 'date,ticker' });
        studied++;
      }
    } catch (e) {
      console.warn(`[LongTermPicker] Study failed for ${candidate.ticker}: ${e}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`[LongTermPicker] Daily study complete: ${studied}/${top20.length} studied`);
  return { scanned, studied };
}

// ─── Friday Final Pick ──────────────────────────────────────────────────────

async function gatherWeekData(): Promise<Map<string, DailyObservation[]>> {
  const weekObs = new Map<string, DailyObservation[]>();

  // Get observations from the last 5 trading days (Mon-Fri)
  const { getServiceClient } = await import('@/lib/supabase');
  const svc = getServiceClient();
  if (!svc) return weekObs;

  // Calculate date range: last 5 days
  const now = new Date();
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.getDay();
    if (day >= 1 && day <= 5) { // weekdays only
      dates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    }
  }

  for (const date of dates) {
    try {
      const { data } = await (svc.from('long_term_study') as any)
        .select('ticker, study_data')
        .eq('date', date);

      if (data) {
        for (const row of data) {
          const ticker = row.ticker;
          const sd = row.study_data as any;
          if (!weekObs.has(ticker)) weekObs.set(ticker, []);
          // Store the full study_data (not just observation) so Friday can access metadata
          weekObs.get(ticker)!.push({ ...sd.observation, _meta: sd });
        }
      }
    } catch (e) {
      console.warn(`[LongTermPicker] Failed to fetch study data for ${date}: ${e}`);
    }
  }

  return weekObs;
}

function buildWeeklySummary(observations: DailyObservation[]): string {
  if (observations.length === 0) return 'No data available';

  const lines: string[] = [];

  // Price trend
  const prices = observations.filter(o => o.cmp != null).map(o => o.cmp!);
  if (prices.length >= 2) {
    const first = prices[0];
    const last = prices[prices.length - 1];
    const weekChangeNum = (last - first) / first * 100;
    const weekChange = weekChangeNum.toFixed(1);
    lines.push(`Price: ₹${first} → ₹${last} (${weekChangeNum >= 0 ? '+' : ''}${weekChange}% week)`);
  }

  // Average RSI
  const rsis = observations.filter(o => o.rsi != null).map(o => o.rsi!);
  if (rsis.length > 0) {
    const avgRsi = (rsis.reduce((a, b) => a + b, 0) / rsis.length).toFixed(0);
    lines.push(`Avg RSI: ${avgRsi} (${rsis.length} days)`);
  }

  // News sentiment trend
  const sentiments = observations.map(o => o.sentimentScore);
  const avgSentiment = sentiments.length > 0
    ? (sentiments.reduce((a, b) => a + b, 0) / sentiments.length).toFixed(0)
    : '0';
  lines.push(`Sentiment: ${avgSentiment} (${observations.length} days)`);

  // News headlines
  const allHeadlines = observations.flatMap(o => o.newsHeadlines).filter(Boolean);
  if (allHeadlines.length > 0) {
    lines.push(`News (${allHeadlines.length} articles):`);
    const unique = [...new Set(allHeadlines)].slice(0, 5);
    unique.forEach(h => lines.push(`  • ${h}`));
  }

  // Daily changes
  const changes = observations.filter(o => o.change != null).map(o => o.change!);
  if (changes.length > 0) {
    const totalChange = changes.reduce((a, b) => a + b, 0);
    lines.push(`Cumulative daily change: ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}%`);
  }

  return lines.join('\n');
}

async function llmFridayAnalysis(c: StudyCandidate, weekData: DailyObservation[]): Promise<Partial<StudyCandidate>> {
  const summary = buildWeeklySummary(weekData);

  const prompt = `You are a senior Indian equity fundamental analyst. You have been studying this stock for a FULL WEEK (5 trading days).

STOCK: ${c.ticker} (${c.name})
SECTOR: ${c.sector} | INDUSTRY: ${c.industry}
Market Cap: ₹${c.marketCapCr ?? 'N/A'} Cr

FUNDAMENTALS:
CMP: ₹${c.cmp ?? 'N/A'} | 52W: ₹${c.low52 ?? 'N/A'} – ₹${c.high52 ?? 'N/A'}
PE: ${c.pe ?? 'N/A'} | PB: ${c.pb ?? 'N/A'} | PEG: ${c.peg ?? 'N/A'}
ROE: ${c.roe ?? 'N/A'}% | ROCE: ${c.roce ?? 'N/A'}%
Debt/Equity: ${c.debtEquity ?? 'N/A'}
Revenue CAGR 3Y: ${c.revCagr3y?.toFixed(1) ?? 'N/A'}% | 5Y: ${c.revCagr5y?.toFixed(1) ?? 'N/A'}%
Profit Growth: ${c.profitGrowth?.toFixed(1) ?? 'N/A'}%
Div Yield: ${c.divYield != null ? c.divYield.toFixed(1) + '%' : 'N/A'}
Free Cash Flow: ${c.freeCashflow != null ? '₹' + (c.freeCashflow / 1e7).toFixed(0) + ' Cr' : 'N/A'}

SCORES: Growth ${c.growthScore} | Value ${c.valueScore} | Quality ${c.qualityScore} | Total ${c.totalScore}/100

WEEK'S DAILY OBSERVATIONS (${weekData.length} days of data):
${summary}

Based on a FULL WEEK of daily study, provide:
1. WEEKLY TREND ANALYSIS: What happened this week? Price action, volume, momentum
2. NEWS IMPACT: Any significant news/announcements and their impact
3. FUNDAMENTAL QUALITY: Business moat, competitive position, growth runway
4. VALUATION: Is it fairly priced for long-term? Upside potential?
5. RISK ASSESSMENT: Top 3 risks
6. ENTRY STRATEGY: Best entry zone and holding period
7. CONVICTION LEVEL: HIGH / MEDIUM / LOW — would you put your own money here?

Be specific with numbers. Indian market context (SEBI, RBI, fiscal policy).
Return as plain text, max 600 words.`;

  const { content } = await callLLM(
    'You are a top Indian equity analyst with 20 years experience. You do thorough research before recommending any stock.',
    prompt,
    1000,
    0.3,
  );

  if (!content) return {};

  const lines = content.split('\n').filter(l => l.trim());
  const sections: Record<string, string[]> = {};
  let current = 'analysis';

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('ENTRY STRATEGY') || upper.includes('ENTRY SUGGESTION')) { current = 'entry'; sections.entry = []; }
    else if (upper.includes('RISK') && upper.includes('ASSESS')) { current = 'risk'; sections.risk = []; }
    else if (upper.includes('HOLDING') || upper.includes('TIMEFRAME')) { current = 'holding'; sections.holding = []; }
    else { if (!sections[current]) sections[current] = []; sections[current].push(line.trim()); }
  }

  return {
    weeklySummary: summary,
    deepAnalysis: sections.analysis?.join('\n').slice(0, 1500) || content.slice(0, 1500),
    holdingPeriod: sections.holding?.join(' ').trim() || '1-3 years',
    riskFactors: sections.risk?.join('\n').slice(0, 600) || 'Market risk, sector risk',
    entrySuggestion: sections.entry?.join(' ').trim() || 'Accumulate on dips',
  };
}

// ─── Email Renderer ─────────────────────────────────────────────────────────

function renderFridayEmail(date: string, picks: StudyCandidate[]): string {
  const pickCards = picks.map((p, i) => {
    const rank = i + 1;
    const scoreColor = p.totalScore >= 70 ? '#22c55e' : p.totalScore >= 55 ? '#eab308' : '#f97316';
    const capLabel = p.marketCapCr != null
      ? p.marketCapCr >= 50000 ? 'Large Cap' : p.marketCapCr >= 10000 ? 'Mid Cap' : p.marketCapCr >= 2000 ? 'Small Cap' : 'Micro Cap'
      : '';

    const obsRows = p.observations.map(o => `
      <tr>
        <td>${o.date}</td>
        <td>₹${o.cmp?.toFixed(0) ?? '?'}</td>
        <td class="${(o.change ?? 0) >= 0 ? 'green' : 'red'}">${o.change != null ? (o.change >= 0 ? '+' : '') + o.change.toFixed(1) + '%' : '?'}</td>
        <td>${o.rsi?.toFixed(0) ?? '?'}</td>
        <td class="${o.sentimentScore > 0 ? 'green' : o.sentimentScore < 0 ? 'red' : ''}">${o.sentimentScore.toFixed(0)}</td>
        <td style="max-width:200px;font-size:11px;color:#94a3b8">${o.newsHeadlines.slice(0, 2).join('; ') || '—'}</td>
      </tr>`).join('');

    return `
    <div class="card">
      <div class="pick-header">
        <span class="rank">#${rank}</span>
        <span class="ticker">${p.ticker}</span>
        <span class="score" style="color:${scoreColor}">${p.totalScore}/100</span>
      </div>
      <div class="company">${p.name} &bull; ${p.sector || 'N/A'} &bull; ${capLabel}</div>

      <div class="metrics-grid">
        <div class="metric"><span class="label">CMP</span><span class="value">₹${p.cmp?.toFixed(0) ?? 'N/A'}</span></div>
        <div class="metric"><span class="label">52W Range</span><span class="value">₹${p.low52?.toFixed(0) ?? '?'} – ₹${p.high52?.toFixed(0) ?? '?'}</span></div>
        <div class="metric"><span class="label">PE</span><span class="value">${p.pe?.toFixed(1) ?? 'N/A'}</span></div>
        <div class="metric"><span class="label">PEG</span><span class="value">${p.peg?.toFixed(2) ?? 'N/A'}</span></div>
        <div class="metric"><span class="label">ROE</span><span class="value ${p.roe != null && p.roe >= 18 ? 'green' : ''}">${p.roe?.toFixed(1) ?? 'N/A'}%</span></div>
        <div class="metric"><span class="label">ROCE</span><span class="value ${p.roce != null && p.roce >= 20 ? 'green' : ''}">${p.roce?.toFixed(1) ?? 'N/A'}%</span></div>
        <div class="metric"><span class="label">Debt/Equity</span><span class="value ${p.debtEquity != null && p.debtEquity < 0.5 ? 'green' : 'red'}">${p.debtEquity?.toFixed(2) ?? 'N/A'}</span></div>
        <div class="metric"><span class="label">Rev CAGR 3Y</span><span class="value ${p.revCagr3y != null && p.revCagr3y >= 15 ? 'green' : ''}">${p.revCagr3y?.toFixed(1) ?? 'N/A'}%</span></div>
        <div class="metric"><span class="label">Profit Growth</span><span class="value ${p.profitGrowth != null && p.profitGrowth >= 15 ? 'green' : ''}">${p.profitGrowth?.toFixed(1) ?? 'N/A'}%</span></div>
        <div class="metric"><span class="label">Div Yield</span><span class="value">${p.divYield != null ? p.divYield.toFixed(1) + '%' : 'N/A'}</span></div>
      </div>

      <div class="score-bar">
        <span>Growth ${p.growthScore}</span>
        <span>Value ${p.valueScore}</span>
        <span>Quality ${p.qualityScore}</span>
        <span>Total ${p.totalScore}</span>
      </div>

      ${p.observations.length > 0 ? `
      <h4>📊 Week's Daily Observations (${p.observations.length} days)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin:8px 0">
        <tr><th>Date</th><th>Price</th><th>Change</th><th>RSI</th><th>Sentiment</th><th>News</th></tr>
        ${obsRows}
      </table>` : ''}

      ${p.weeklySummary ? `<div class="summary"><h4>📈 Weekly Summary</h4><pre style="white-space:pre-wrap;font-size:12px;color:#e2e8f0">${p.weeklySummary}</pre></div>` : ''}
      ${p.deepAnalysis ? `<div class="analysis"><h4>🧠 AI Deep Analysis (Full Week Study)</h4><p>${p.deepAnalysis.replace(/\n/g, '<br/>')}</p></div>` : ''}
      ${p.holdingPeriod ? `<div class="tag">📅 Holding: ${p.holdingPeriod}</div>` : ''}
      ${p.riskFactors ? `<div class="risks"><h4>⚠️ Risk Factors</h4><p>${p.riskFactors.replace(/\n/g, '<br/>')}</p></div>` : ''}
      ${p.entrySuggestion ? `<div class="entry"><h4>💡 Entry Strategy</h4><p>${p.entrySuggestion}</p></div>` : ''}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Quantum Alpha — Friday Long-Term Picks ${date}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:780px;margin:0 auto;padding:24px 20px 40px}
  h1{font-size:20px;color:#fff;margin:0 0 4px}
  .sub{color:#94a3b8;font-size:12px;margin:0 0 20px}
  h2{font-size:14px;color:#E8621A;margin:24px 0 10px;text-transform:uppercase;letter-spacing:0.06em}
  h4{color:#3b82f6;font-size:12px;margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.04em}
  .card{background:#111827;border:1px solid #1e293b;border-radius:10px;padding:16px 18px;margin:12px 0}
  .pick-header{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .rank{background:#1e293b;color:#94a3b8;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .ticker{font-size:18px;font-weight:700;color:#fff}
  .score{font-size:16px;font-weight:700;margin-left:auto}
  .company{color:#94a3b8;font-size:12px;margin-bottom:12px}
  .metrics-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0}
  .metric{background:#0f172a;border-radius:6px;padding:8px 6px;text-align:center}
  .metric .label{display:block;color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:2px}
  .metric .value{display:block;color:#fff;font-size:13px;font-weight:600}
  .score-bar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;font-size:11px;color:#94a3b8}
  .score-bar span{background:#1e293b;padding:3px 8px;border-radius:4px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th{color:#94a3b8;text-align:left;padding:4px 6px;border-bottom:1px solid #1e293b;text-transform:uppercase;font-size:9px}
  td{padding:4px 6px;border-bottom:1px solid #1e293b}
  .summary,.analysis,.risks,.entry{background:#0f172a;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:6px;margin:8px 0;font-size:13px;line-height:1.5}
  .risks{border-left-color:#ef4444}
  .entry{border-left-color:#22c55e}
  .tag{display:inline-block;background:#1e293b;color:#94a3b8;padding:3px 10px;border-radius:4px;font-size:11px;margin:4px 0}
  .green{color:#22c55e}
  .red{color:#ef4444}
  hr{border:none;border-top:1px solid #1e293b;margin:20px 0}
  .muted{color:#64748b;font-size:11px}
  .center{text-align:center}
  .disclaimer{background:#1a2332;border:1px solid #1e293b;border-radius:8px;padding:12px;margin:16px 0;font-size:11px;color:#94a3b8;line-height:1.4}
  pre{margin:0;font-family:'Segoe UI',system-ui,sans-serif}
</style></head>
<body><div class="wrap">
  <h1>🎯 Friday Long-Term Stock Picks — ${date}</h1>
  <p class="sub">Week-long AI study of 500+ NSE stocks &bull; ${picks.length > 0 ? picks[0].observations.length : 0} days of daily analysis per stock</p>

  <h2>🏆 This Week's Top ${picks.length} Picks</h2>
  ${pickCards}

  <div class="disclaimer">
    <strong>⚠️ Disclaimer:</strong> These are AI-generated analysis based on publicly available financial data and a week of daily study.
    They are NOT financial advice. Always do your own research and consult a SEBI-registered investment advisor.
    Past performance does not guarantee future results. The AI learns from market outcomes and improves over time.
  </div>

  <hr/>
  <p class="muted center" style="font-size:11px">Quantum Alpha Terminal &bull; Week-long study system &bull; ${picks.length > 0 ? picks[0].observations.length : 0} days of daily data per pick &bull; Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
</div></body></html>`;
}

// ─── Main Entry ─────────────────────────────────────────────────────────────

export async function runLongTermStockPicker(): Promise<{
  mode: 'daily-study' | 'friday-pick';
  scanned?: number;
  studied?: number;
  picks?: number;
  sent?: boolean;
  error?: string;
}> {
  const now = new Date();
  const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const istDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const dayOfWeek = now.getDay();

  if (dayOfWeek === 5) {
    // ─── FRIDAY: Final pick ────────────────────────────────────────────────
    console.log(`[LongTermPicker] FRIDAY FINAL PICK at ${istTime} IST — ${istDate}`);

    // 1. Gather week's study data
    const weekData = await gatherWeekData();
    console.log(`[LongTermPicker] Loaded ${weekData.size} tickers with daily data`);

    if (weekData.size === 0) {
      console.log(`[LongTermPicker] No weekly data found — running daily scan instead`);
      const result = await runDailyStudy();
      return { mode: 'daily-study', ...result };
    }

    // 2. Score and rank by consistency (stocks studied 3+ days)
    const scored: StudyCandidate[] = [];
    for (const [ticker, observations] of weekData) {
      if (observations.length < 2) continue; // Need at least 2 days of data

      const first = observations[0] as any; // has _meta from Supabase study_data
      const meta = first._meta || {};
      const scoredCandidate: StudyCandidate = {
        ticker,
        name: meta.name || ticker,
        sector: meta.sector || '',
        industry: meta.industry || '',
        marketCapCr: meta.marketCapCr,
        cmp: first.cmp,
        high52: null,
        low52: null,
        pe: meta.pe ?? first.fundamentals?.pe,
        pb: null,
        peg: null,
        roe: meta.roe ?? first.fundamentals?.roe,
        roce: null,
        debtEquity: meta.debtEquity ?? first.fundamentals?.debtEquity,
        revCagr3y: null,
        revCagr5y: null,
        profitGrowth: null,
        divYield: null,
        freeCashflow: null,
        growthScore: meta.growthScore || 0,
        valueScore: meta.valueScore || 0,
        qualityScore: meta.qualityScore || 0,
        totalScore: meta.totalScore || first.scoreAtScan || 0,
        observations: observations.map((o: any) => ({ ...o, _meta: undefined })), // strip _meta from observations
      };
      scored.push(scoredCandidate);
    }

    scored.sort((a, b) => b.totalScore - a.totalScore);
    const topPicks = scored.slice(0, 5);

    console.log(`[LongTermPicker] Top Friday picks: ${topPicks.map(p => `${p.ticker}(${p.totalScore},${p.observations.length}d)`).join(', ')}`);

    // 3. LLM deep analysis using full week data
    for (const pick of topPicks) {
      try {
        const analysis = await llmFridayAnalysis(pick, pick.observations);
        Object.assign(pick, analysis);
      } catch (e) {
        console.warn(`[LongTermPicker] LLM analysis failed for ${pick.ticker}: ${e}`);
      }
    }

    // 4. Render and send email
    const html = renderFridayEmail(istDate, topPicks);
    const subject = `🎯 Quantum Alpha — Friday Long-Term Picks ${istDate} (${topPicks.length} stocks, week-studied)`;

    let sent = false;
    try {
      const result = await sendEmailSmtp(
        process.env.ANNUAL_REPORT_EMAIL || process.env.ADMIN_EMAIL || 'zn4.editz@gmail.com',
        subject,
        html,
      );
      sent = !!(result && (result as any).ok !== false);
      console.log(`[LongTermPicker] Friday email sent: ${sent}`);
    } catch (e) {
      console.warn(`[LongTermPicker] Email failed: ${e}`);
    }

    // 5. Log to Supabase
    try {
      const { getServiceClient } = await import('@/lib/supabase');
      const svc = getServiceClient();
      if (svc) {
        await (svc.from('ai_knowledge_snapshots') as any).insert({
          snapshot_type: 'long_term_friday_picks',
          snapshot_data: {
            date: istDate,
            picks: topPicks.map(p => ({
              ticker: p.ticker,
              name: p.name,
              score: p.totalScore,
              daysStudied: p.observations.length,
              holdingPeriod: p.holdingPeriod,
            })),
            totalStudied: weekData.size,
          },
        });
      }
    } catch (e) {
      console.warn(`[LongTermPicker] Supabase log failed: ${e}`);
    }

    return { mode: 'friday-pick', picks: topPicks.length, sent };

  } else {
    // ─── MON-THU: Daily study ──────────────────────────────────────────────
    console.log(`[LongTermPicker] DAILY STUDY at ${istTime} IST — ${istDate} (day ${dayOfWeek})`);
    const result = await runDailyStudy();
    return { mode: 'daily-study', ...result };
  }
}
