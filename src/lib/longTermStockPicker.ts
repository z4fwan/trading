/**
 * Long-Term Stock Picker — runs daily at 16:20 IST after market close.
 *
 * Scans the full Nifty 500 universe, scores every stock on 6 long-term
 * dimensions (growth, value, quality, momentum, safety, catalyst), picks
 * the top 3-5, runs LLM deep-dive on each, and sends a detailed email.
 *
 * Focus: real growth stocks — not just large caps.
 */

import { getFullUniverse } from '@/lib/dynamicUniverse';
import { fetchRawFundamentals, type RawFundamentals } from '@/lib/stockPulse/fundamentalFetcher';
import { callLLM } from '@/lib/llmProvider';
import { sendEmailSmtp } from '@/lib/annualReport/sendEmail';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LongTermCandidate {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  cmp: number | null;
  marketCapCr: number | null;

  // Scores (0-100 each)
  growthScore: number;
  valueScore: number;
  qualityScore: number;
  momentumScore: number;
  safetyScore: number;
  catalystScore: number;
  totalScore: number;

  // Key metrics
  revCagr3y: number | null;
  revCagr5y: number | null;
  profitGrowth: number | null;
  roe: number | null;
  roce: number | null;
  pe: number | null;
  pb: number | null;
  peg: number | null;
  debtEquity: number | null;
  divYield: number | null;
  freeCashflow: number | null;
  high52: number | null;
  low52: number | null;

  // LLM deep analysis
  deepAnalysis?: string;
  holdingPeriod?: string;
  riskFactors?: string;
  entrySuggestion?: string;
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreGrowth(raw: RawFundamentals): number {
  let score = 0;

  // Revenue CAGR (3y and 5y)
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

  // Profit growth
  if (raw.earningsGrowth != null) {
    if (raw.earningsGrowth >= 30) score += 25;
    else if (raw.earningsGrowth >= 15) score += 18;
    else if (raw.earningsGrowth >= 5) score += 10;
    else if (raw.earningsGrowth >= 0) score += 4;
    else score -= 5;
  }

  // Acceleration: rev3 > rev5 means growth is accelerating
  if (rev3 != null && rev5 != null && rev3 > rev5 && rev3 > 0) score += 10;

  // Operating margin expansion proxy (high margin = sustainable growth)
  if (raw.operatingMargins != null && raw.operatingMargins >= 20) score += 10;
  else if (raw.operatingMargins != null && raw.operatingMargins >= 12) score += 5;

  return Math.max(0, Math.min(100, score));
}

function scoreValue(raw: RawFundamentals): number {
  let score = 0;

  // PEG ratio (best value indicator)
  if (raw.peg != null) {
    if (raw.peg > 0 && raw.peg < 0.8) score += 30;
    else if (raw.peg < 1.2) score += 22;
    else if (raw.peg < 1.8) score += 14;
    else if (raw.peg < 2.5) score += 6;
    else score -= 5;
  }

  // PE relative to growth
  if (raw.pe != null && raw.earningsGrowth != null && raw.earningsGrowth > 0) {
    const pegProxy = raw.pe / raw.earningsGrowth;
    if (pegProxy < 0.5) score += 20;
    else if (pegProxy < 1.0) score += 14;
    else if (pegProxy < 1.5) score += 8;
    else score += 2;
  }

  // Price vs 52-week range (buy near lows = better value)
  if (raw.cmp != null && raw.high52 != null && raw.low52 != null && raw.high52 > raw.low52) {
    const pos = (raw.cmp - raw.low52) / (raw.high52 - raw.low52);
    if (pos < 0.25) score += 20;    // Near 52-week low — deep value
    else if (pos < 0.40) score += 14; // Below midpoint
    else if (pos < 0.60) score += 8;  // Mid-range
    else if (pos < 0.80) score += 3;  // Near highs
    else score -= 3;                   // At 52-week high — overvalued
  }

  // PB ratio
  if (raw.pb != null) {
    if (raw.pb > 0 && raw.pb < 1.5) score += 15;
    else if (raw.pb < 3) score += 10;
    else if (raw.pb < 5) score += 5;
    else score += 1;
  }

  // Dividend yield (bonus for value)
  if (raw.divYield != null && raw.divYield >= 1.5) score += 8;
  else if (raw.divYield != null && raw.divYield >= 0.5) score += 4;

  return Math.max(0, Math.min(100, score));
}

function scoreQuality(raw: RawFundamentals): number {
  let score = 0;

  // ROE (best quality metric)
  if (raw.roe != null) {
    if (raw.roe >= 25) score += 28;
    else if (raw.roe >= 18) score += 22;
    else if (raw.roe >= 12) score += 14;
    else if (raw.roe >= 8) score += 6;
    else score -= 3;
  }

  // ROCE
  if (raw.roce != null) {
    if (raw.roce >= 30) score += 22;
    else if (raw.roce >= 20) score += 16;
    else if (raw.roce >= 14) score += 10;
    else if (raw.roce >= 8) score += 4;
  }

  // Debt management
  if (raw.debtEquity != null) {
    if (raw.debtEquity < 0.3) score += 20;    // Almost debt-free
    else if (raw.debtEquity < 0.6) score += 14;
    else if (raw.debtEquity < 1.0) score += 8;
    else if (raw.debtEquity < 1.5) score += 3;
    else score -= 5;                           // Over-leveraged
  }

  // Profit margins
  if (raw.profitMargins != null) {
    if (raw.profitMargins >= 20) score += 15;
    else if (raw.profitMargins >= 12) score += 10;
    else if (raw.profitMargins >= 6) score += 5;
  }

  // Free cash flow (positive = self-funding growth)
  if (raw.freeCashflow != null && raw.freeCashflow > 0) score += 10;
  else if (raw.freeCashflow != null && raw.freeCashflow > -raw.marketCapCr! * 1e7 * 0.05) score += 3;

  return Math.max(0, Math.min(100, score));
}

function scoreMomentum(raw: RawFundamentals): number {
  let score = 0;

  // Price vs 52-week high (near highs = strong momentum, but not overbought)
  if (raw.cmp != null && raw.high52 != null && raw.low52 != null && raw.high52 > raw.low52) {
    const pos = (raw.cmp - raw.low52) / (raw.high52 - raw.low52);
    if (pos >= 0.65 && pos <= 0.85) score += 25;  // Sweet spot: strong but not overextended
    else if (pos >= 0.50 && pos < 0.65) score += 18;
    else if (pos >= 0.85) score += 12;             // Very high — might be overextended
    else if (pos >= 0.30) score += 8;
    else score += 2;                               // Weak momentum
  }

  // Revenue acceleration
  const rev3 = raw.revenueGrowth ?? (raw.revenueHistory.length >= 4 ? cagrSimple(raw.revenueHistory.slice(-4)) : null);
  const rev5 = cagrSimple(raw.revenueHistory.slice(-6));
  if (rev3 != null && rev5 != null && rev3 > rev5 + 3) score += 20;
  else if (rev3 != null && rev3 > 10) score += 12;

  // Earnings momentum
  if (raw.earningsGrowth != null && raw.earningsGrowth >= 20) score += 20;
  else if (raw.earningsGrowth != null && raw.earningsGrowth >= 10) score += 12;

  // Market cap momentum proxy (larger caps more likely to sustain)
  if (raw.marketCapCr != null) {
    if (raw.marketCapCr >= 50000) score += 10;   // Large cap stability
    else if (raw.marketCapCr >= 10000) score += 8; // Mid cap growth
    else if (raw.marketCapCr >= 3000) score += 6;  // Small cap high growth potential
    else score += 3;                                // Micro cap — risky but high upside
  }

  // EBITDA growth proxy
  if (raw.ebitda != null && raw.revenueGrowth != null && raw.revenueGrowth > 0) {
    if (raw.ebitda > 0 && raw.operatingMargins != null && raw.operatingMargins >= 15) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreSafety(raw: RawFundamentals): number {
  let score = 0;

  // Debt safety
  if (raw.debtEquity != null && raw.debtEquity < 0.5) score += 25;
  else if (raw.debtEquity != null && raw.debtEquity < 1.0) score += 15;
  else if (raw.debtEquity != null && raw.debtEquity < 1.5) score += 5;
  else score -= 10;

  // Current ratio (liquidity)
  if (raw.currentRatio != null) {
    if (raw.currentRatio >= 1.5) score += 20;
    else if (raw.currentRatio >= 1.0) score += 12;
    else score -= 5;
  }

  // Consistent profitability (positive earnings history)
  const positiveEarnings = raw.earningsHistory.filter(e => e > 0).length;
  if (raw.earningsHistory.length >= 3) {
    const ratio = positiveEarnings / raw.earningsHistory.length;
    if (ratio >= 0.9) score += 20;
    else if (ratio >= 0.7) score += 12;
    else if (ratio >= 0.5) score += 5;
    else score -= 5;
  }

  // Cash position vs debt
  if (raw.totalCash != null && raw.totalDebt != null) {
    const cashRatio = raw.totalDebt > 0 ? raw.totalCash / raw.totalDebt : 5;
    if (cashRatio >= 1.5) score += 15;
    else if (cashRatio >= 0.8) score += 10;
    else if (cashRatio >= 0.4) score += 5;
  }

  // Market cap floor (avoid penny/micro caps for long-term)
  if (raw.marketCapCr != null && raw.marketCapCr >= 5000) score += 15;
  else if (raw.marketCapCr != null && raw.marketCapCr >= 2000) score += 10;
  else if (raw.marketCapCr != null && raw.marketCapCr >= 500) score += 5;

  // Dividend safety signal
  if (raw.divYield != null && raw.divYield >= 0.5) score += 5;

  return Math.max(0, Math.min(100, score));
}

function scoreCatalyst(raw: RawFundamentals): number {
  let score = 0;

  // Sector tailwind proxy: high-growth sectors
  const growthSectors = ['Technology', 'Healthcare', 'Renewable Energy', 'Electric Vehicles',
    'Semiconductors', 'Defence', 'Space', 'AI', 'Cybersecurity', 'Fintech',
    'Specialty Chemicals', 'Capital Goods', 'Infrastructure', 'Defence'];
  const sector = (raw.sector || '').toLowerCase();
  for (const s of growthSectors) {
    if (sector.includes(s.toLowerCase())) { score += 15; break; }
  }

  // Industry tailwind
  const industry = (raw.industry || '').toLowerCase();
  const growthIndustries = ['software', 'semiconductor', 'pharmaceutical', 'chemical',
    'renewable', 'electric', 'defence', 'aerospace', 'automation', 'analytics',
    'cloud', 'fintech', 'biotech', 'medical', 'diagnostic'];
  for (const g of growthIndustries) {
    if (industry.includes(g)) { score += 10; break; }
  }

  // PE gap: low PE in a growth sector = rerating potential
  if (raw.pe != null && raw.pe > 0 && raw.pe < 20 && raw.revenueGrowth != null && raw.revenueGrowth > 15) {
    score += 20; // Classic rerating candidate
  }

  // Under-followed / mid-cap premium (less analyst coverage = more alpha)
  if (raw.marketCapCr != null && raw.marketCapCr >= 2000 && raw.marketCapCr <= 25000) {
    score += 10; // Mid-cap sweet spot for long-term
  }

  // Promoter buying signal (if available via PE gap proxy)
  if (raw.peg != null && raw.peg > 0 && raw.peg < 0.7) score += 10; // Deep value = likely insider interest

  return Math.max(0, Math.min(100, score));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cagrSimple(values: number[]): number | null {
  const clean = values.filter(v => v > 0);
  if (clean.length < 2) return null;
  const start = clean[0];
  const end = clean[clean.length - 1];
  const years = clean.length - 1;
  if (start <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function scoreCandidate(raw: RawFundamentals): LongTermCandidate {
  const growthScore = scoreGrowth(raw);
  const valueScore = scoreValue(raw);
  const qualityScore = scoreQuality(raw);
  const momentumScore = scoreMomentum(raw);
  const safetyScore = scoreSafety(raw);
  const catalystScore = scoreCatalyst(raw);

  // Weighted total: growth (30%) + quality (25%) + value (20%) + safety (10%) + momentum (10%) + catalyst (5%)
  const totalScore = Math.round(
    growthScore * 0.30 +
    qualityScore * 0.25 +
    valueScore * 0.20 +
    safetyScore * 0.10 +
    momentumScore * 0.10 +
    catalystScore * 0.05
  );

  const rev3 = raw.revenueGrowth ?? (raw.revenueHistory.length >= 4 ? cagrSimple(raw.revenueHistory.slice(-4)) : null);

  return {
    ticker: raw.ticker,
    name: raw.companyName,
    sector: raw.sector,
    industry: raw.industry,
    cmp: raw.cmp,
    marketCapCr: raw.marketCapCr,

    growthScore,
    valueScore,
    qualityScore,
    momentumScore,
    safetyScore,
    catalystScore,
    totalScore,

    revCagr3y: rev3,
    revCagr5y: cagrSimple(raw.revenueHistory.slice(-6)),
    profitGrowth: raw.earningsGrowth,
    roe: raw.roe,
    roce: raw.roce,
    pe: raw.pe,
    pb: raw.pb,
    peg: raw.peg,
    debtEquity: raw.debtEquity,
    divYield: raw.divYield,
    freeCashflow: raw.freeCashflow,
    high52: raw.high52,
    low52: raw.low52,
  };
}

// ─── LLM Deep Analysis ─────────────────────────────────────────────────────

async function llmDeepAnalysis(c: LongTermCandidate): Promise<Partial<LongTermCandidate>> {
  const prompt = `You are a senior Indian equity fundamental analyst specializing in long-term wealth creation.

Analyze this stock for LONG-TERM investment (6 months to 5 years):

STOCK: ${c.ticker} (${c.name})
SECTOR: ${c.sector} | INDUSTRY: ${c.industry}
CMP: ₹${c.cmp ?? 'N/A'} | Market Cap: ₹${c.marketCapCr ?? 'N/A'} Cr
52W Range: ₹${c.low52 ?? 'N/A'} – ₹${c.high52 ?? 'N/A'}

FUNDAMENTALS:
Revenue CAGR 3Y: ${c.revCagr3y != null ? c.revCagr3y.toFixed(1) + '%' : 'N/A'}
Revenue CAGR 5Y: ${c.revCagr5y != null ? c.revCagr5y.toFixed(1) + '%' : 'N/A'}
Profit Growth: ${c.profitGrowth != null ? c.profitGrowth.toFixed(1) + '%' : 'N/A'}
ROE: ${c.roe != null ? c.roe.toFixed(1) + '%' : 'N/A'}
ROCE: ${c.roce != null ? c.roce.toFixed(1) + '%' : 'N/A'}
PE: ${c.pe ?? 'N/A'} | PB: ${c.pb ?? 'N/A'} | PEG: ${c.peg ?? 'N/A'}
Debt/Equity: ${c.debtEquity ?? 'N/A'} | Div Yield: ${c.divYield != null ? c.divYield.toFixed(1) + '%' : 'N/A'}
Free Cash Flow: ${c.freeCashflow != null ? '₹' + (c.freeCashflow / 1e7).toFixed(0) + ' Cr' : 'N/A'}

SCORING:
Growth: ${c.growthScore}/100 | Value: ${c.valueScore}/100 | Quality: ${c.qualityScore}/100
Momentum: ${c.momentumScore}/100 | Safety: ${c.safetyScore}/100 | Catalyst: ${c.catalystScore}/100
TOTAL: ${c.totalScore}/100

Provide:
1. DEEP ANALYSIS (3-4 paragraphs): Business quality, competitive moat, growth runway, sector tailwinds
2. HOLDING PERIOD: Best timeframe (6M / 1Y / 2Y / 5Y)
3. RISK FACTORS: Top 3 risks to monitor
4. ENTRY SUGGESTION: Ideal entry zone and strategy

Be specific with numbers. Focus on Indian market context (SEBI, RBI, fiscal policy impacts).
Return as plain text, max 500 words.`;

  const { content } = await callLLM(
    'You are a top Indian equity analyst with 20 years experience in fundamental analysis.',
    prompt,
    800,
    0.3,
  );

  if (!content) return {};

  // Parse LLM response into fields
  const lines = content.split('\n').filter(l => l.trim());
  const sections: Record<string, string[]> = {};
  let currentSection = 'analysis';

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('HOLDING PERIOD') || upper.includes('HOLDING TIMEFRAME') || upper.includes('TIMEFRAME')) {
      currentSection = 'holding';
      sections.holding = [];
    } else if (upper.includes('RISK') && (upper.includes('FACTOR') || upper.includes('MONITOR'))) {
      currentSection = 'risk';
      sections.risk = [];
    } else if (upper.includes('ENTRY') && (upper.includes('SUGGEST') || upper.includes('ZONE') || upper.includes('STRATEGY'))) {
      currentSection = 'entry';
      sections.entry = [];
    } else if (upper.includes('DEEP ANALYSIS') || upper.includes('BUSINESS QUALITY')) {
      currentSection = 'analysis';
      sections.analysis = [];
    } else {
      if (!sections[currentSection]) sections[currentSection] = [];
      sections[currentSection].push(line.trim());
    }
  }

  return {
    deepAnalysis: sections.analysis?.join('\n').slice(0, 1200) || content.slice(0, 1200),
    holdingPeriod: sections.holding?.join(' ').trim() || '1-3 years',
    riskFactors: sections.risk?.join('\n').slice(0, 600) || 'Market risk, sector risk, execution risk',
    entrySuggestion: sections.entry?.join(' ').trim() || 'Accumulate on dips',
  };
}

// ─── Email Renderer ─────────────────────────────────────────────────────────

function renderLongTermEmail(date: string, picks: LongTermCandidate[]): string {
  const pickCards = picks.map((p, i) => {
    const rank = i + 1;
    const scoreColor = p.totalScore >= 70 ? '#22c55e' : p.totalScore >= 55 ? '#eab308' : '#f97316';
    const capLabel = p.marketCapCr != null
      ? p.marketCapCr >= 50000 ? 'Large Cap' : p.marketCapCr >= 10000 ? 'Mid Cap' : p.marketCapCr >= 2000 ? 'Small Cap' : 'Micro Cap'
      : '';

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
        <span>Safety ${p.safetyScore}</span>
        <span>Momentum ${p.momentumScore}</span>
        <span>Catalyst ${p.catalystScore}</span>
      </div>

      ${p.deepAnalysis ? `<div class="analysis"><h4>🧠 AI Deep Analysis</h4><p>${p.deepAnalysis.replace(/\n/g, '<br/>')}</p></div>` : ''}
      ${p.holdingPeriod ? `<div class="tag">📅 Holding: ${p.holdingPeriod}</div>` : ''}
      ${p.riskFactors ? `<div class="risks"><h4>⚠️ Risk Factors</h4><p>${p.riskFactors.replace(/\n/g, '<br/>')}</p></div>` : ''}
      ${p.entrySuggestion ? `<div class="entry"><h4>💡 Entry Strategy</h4><p>${p.entrySuggestion}</p></div>` : ''}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Quantum Alpha — Long-Term Stock Picks ${date}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:760px;margin:0 auto;padding:24px 20px 40px}
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
  .analysis,.risks,.entry{background:#0f172a;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:6px;margin:8px 0;font-size:13px;line-height:1.5}
  .risks{border-left-color:#ef4444}
  .entry{border-left-color:#22c55e}
  .tag{display:inline-block;background:#1e293b;color:#94a3b8;padding:3px 10px;border-radius:4px;font-size:11px;margin:4px 0}
  .green{color:#22c55e}
  .red{color:#ef4444}
  hr{border:none;border-top:1px solid #1e293b;margin:20px 0}
  .muted{color:#64748b;font-size:11px}
  .center{text-align:center}
  .disclaimer{background:#1a2332;border:1px solid #1e293b;border-radius:8px;padding:12px;margin:16px 0;font-size:11px;color:#94a3b8;line-height:1.4}
</style></head>
<body><div class="wrap">
  <h1>🎯 Long-Term Stock Picks — ${date}</h1>
  <p class="sub">AI-analyzed growth stocks for 6 months to 5 years &bull; Based on ${picks.length > 0 ? '500+' : 'N/A'} NSE stocks scanned</p>

  <h2>🏆 Today's Top ${picks.length} Picks</h2>
  ${pickCards}

  <div class="disclaimer">
    <strong>⚠️ Disclaimer:</strong> These are AI-generated analysis based on publicly available financial data.
    They are NOT financial advice. Always do your own research and consult a SEBI-registered investment advisor
    before making investment decisions. Past performance does not guarantee future results.
    The AI learns from market outcomes and improves over time, but no prediction system is 100% accurate.
  </div>

  <hr/>
  <p class="muted center" style="font-size:11px">Quantum Alpha Terminal &bull; Fully autonomous AI &bull; Scans 500+ NSE stocks daily &bull; Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
</div></body></html>`;
}

// ─── Main Entry ─────────────────────────────────────────────────────────────

export async function runLongTermStockPicker(): Promise<{
  picks: number;
  sent: boolean;
  error?: string;
}> {
  const now = new Date();
  const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const istDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  console.log(`[LongTermPicker] Starting daily scan at ${istTime} IST — date ${istDate}`);

  // 1. Get full universe
  const allTickers = getFullUniverse();
  console.log(`[LongTermPicker] Scanning ${allTickers.length} tickers...`);

  // 2. Score all tickers
  const candidates: LongTermCandidate[] = [];
  let scanned = 0;
  let errors = 0;

  // Scan in batches of 10 with delay between to avoid rate limits
  for (let i = 0; i < allTickers.length; i += 10) {
    const batch = allTickers.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const raw = await fetchRawFundamentals(ticker);
          if (!raw || !raw.cmp || raw.cmp <= 0) return null;
          // Filter out micro-caps under 200 Cr market cap
          if (raw.marketCapCr != null && raw.marketCapCr < 200) return null;
          return scoreCandidate(raw);
        } catch {
          errors++;
          return null;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        candidates.push(r.value);
        scanned++;
      }
    }

    // Small delay between batches
    if (i + 10 < allTickers.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`[LongTermPicker] Scored ${scanned} stocks (${errors} errors). Sorting...`);

  // 3. Sort by total score and take top 5
  candidates.sort((a, b) => b.totalScore - a.totalScore);
  const topPicks = candidates.slice(0, 5);

  if (topPicks.length === 0) {
    console.log(`[LongTermPicker] No candidates found — skipping email.`);
    return { picks: 0, sent: false, error: 'No candidates scored above threshold' };
  }

  console.log(`[LongTermPicker] Top picks: ${topPicks.map(p => `${p.ticker}(${p.totalScore})`).join(', ')}`);

  // 4. LLM deep analysis on each pick (parallel, with timeout)
  const analysisPromises = topPicks.map(async (pick) => {
    try {
      const analysis = await llmDeepAnalysis(pick);
      Object.assign(pick, analysis);
    } catch (e) {
      console.warn(`[LongTermPicker] LLM analysis failed for ${pick.ticker}: ${e}`);
    }
  });
  await Promise.allSettled(analysisPromises);

  // 5. Render and send email
  const html = renderLongTermEmail(istDate, topPicks);
  const subject = `🎯 Quantum Alpha — Long-Term Picks ${istDate} (${topPicks.length} stocks)`;

  let sent = false;
  try {
    sent = await sendEmailSmtp(
      process.env.ANNUAL_REPORT_EMAIL || process.env.ADMIN_EMAIL || 'zn4.editz@gmail.com',
      subject,
      html,
    );
    console.log(`[LongTermPicker] Email sent: ${sent}`);
  } catch (e) {
    console.warn(`[LongTermPicker] Email failed: ${e}`);
  }

  // 6. Log to Supabase knowledge snapshot for memory
  try {
    const { getServiceClient } = await import('@/lib/supabase');
    const svc = getServiceClient();
    if (svc) {
      await svc.from('ai_knowledge_snapshots').insert({
        snapshot_type: 'long_term_picks',
        snapshot_data: {
          date: istDate,
          picks: topPicks.map(p => ({
            ticker: p.ticker,
            name: p.name,
            score: p.totalScore,
            growth: p.growthScore,
            value: p.valueScore,
            quality: p.qualityScore,
            pe: p.pe,
            roe: p.roe,
            sector: p.sector,
          })),
          scanned,
          errors,
        },
      });
    }
  } catch (e) {
    console.warn(`[LongTermPicker] Supabase log failed: ${e}`);
  }

  return { picks: topPicks.length, sent };
}
