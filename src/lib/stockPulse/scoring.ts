import { cagr, getNiftyPeProxy, type RawFundamentals } from './fundamentalFetcher';
import { ownershipFromCrossCheck } from './crossCheck';
import { tightenDataConfidence } from './indianAccuracyMerge';
import type {
  FlagItem,
  GemArchetype,
  GrowthClass,
  MoatBreakdown,
  MoatTier,
  MultibaggerPick,
  MultibaggerTier,
  PeerRow,
  PulseQuality,
  RatioRow,
  ScenarioCase,
  StockPulseReport,
  ValuationSignal,
  ValuationVerdict,
  DataConfidence,
} from './types';

function valSignal(current: number | null, sector: number | null, own5y: number | null): ValuationSignal | null {
  if (current == null) return null;
  const ref = sector ?? own5y ?? getNiftyPeProxy();
  const own = own5y ?? ref;
  const belowSector = ref > 0 && current < ref * 0.85;
  const belowOwn = own > 0 && current < own * 0.85;
  const aboveSector = ref > 0 && current > ref * 1.15;
  const aboveOwn = own > 0 && current > own * 1.15;
  if (belowSector && belowOwn) return 'CHEAP';
  if (aboveSector && aboveOwn) return 'RICH';
  return 'FAIR';
}

function rangePosition(cmp: number | null, hi: number | null, lo: number | null): 'TOP' | 'MID' | 'BOTTOM' | null {
  if (cmp == null || hi == null || lo == null || hi <= lo) return null;
  const p = (cmp - lo) / (hi - lo);
  if (p >= 0.75) return 'TOP';
  if (p <= 0.25) return 'BOTTOM';
  return 'MID';
}

export function buildStockPulseReport(raw: RawFundamentals, horizonYears: number): StockPulseReport {
  const acc = raw.accuracy;
  const rev5 = acc?.salesCagr5y ?? cagr(raw.revenueHistory.slice(-6));
  const rev3 = acc?.salesCagr3y ?? raw.revenueGrowth ?? (raw.revenueHistory.length >= 4 ? cagr(raw.revenueHistory.slice(-4)) : null);
  const profit5 = acc?.profitCagr5y ?? cagr(raw.earningsHistory.slice(-6).map(Math.abs));
  const profit3 = acc?.profitCagr3y ?? raw.earningsGrowth;

  const sectorPeRef = raw.sectorPe ?? getNiftyPeProxy();
  const src = (key: string) => acc?.metricSources[key] ?? 'Yahoo Finance';

  let growthClass: GrowthClass = 'STEADY';
  if (rev3 != null && rev5 != null) {
    if (rev3 < 0 && (profit3 ?? 0) < 0) growthClass = 'DECLINING';
    else if (rev3 < rev5 - 3) growthClass = 'SLOWING';
    else if (rev3 > rev5 + 2 && (profit3 ?? 0) > 0) growthClass = 'ACCELERATING';
  } else if ((rev3 ?? 0) < 0) growthClass = 'DECLINING';

  const peSig = valSignal(raw.pe, sectorPeRef, null);
  const pbSig = valSignal(raw.pb, 3, null);
  const rows: RatioRow[] = [
    { label: 'P/E', current: raw.pe, sectorAvg: sectorPeRef, own5yAvg: null, niftyAvg: getNiftyPeProxy(), signal: peSig, explain: 'Price per ₹1 of annual profit', source: src('pe') },
    { label: 'P/B', current: raw.pb, sectorAvg: 3, own5yAvg: null, niftyAvg: null, signal: pbSig, explain: 'Price vs book assets', source: src('pb') },
    { label: 'EV/EBITDA', current: raw.evEbitda, sectorAvg: null, own5yAvg: null, niftyAvg: null, signal: valSignal(raw.evEbitda, 12, null), explain: 'Full business value check', source: src('evEbitda') },
    { label: 'PEG', current: raw.peg, sectorAvg: 1, own5yAvg: null, niftyAvg: null, signal: raw.peg != null ? (raw.peg < 1 ? 'CHEAP' : raw.peg > 2 ? 'RICH' : 'FAIR') : null, explain: 'P/E adjusted for growth', source: src('peg') },
    { label: 'Dividend yield', current: raw.divYield, sectorAvg: 1.2, own5yAvg: null, niftyAvg: 1.2, signal: null, source: src('divYield') },
  ];

  const cheapCount = rows.filter(r => r.signal === 'CHEAP').length;
  const richCount = rows.filter(r => r.signal === 'RICH').length;
  let verdict: ValuationVerdict = 'MIXED';
  if (cheapCount >= 2) verdict = 'UNDERVALUED';
  else if (richCount >= 2) verdict = 'OVERVALUED';
  else if (cheapCount === 0 && richCount === 0) verdict = 'FAIRLY_VALUED';

  const flags: FlagItem[] = [];
  if (raw.debtEquity != null && raw.debtEquity > 2) {
    flags.push({ code: 'DE', title: 'High debt/equity', note: `D/E is ${raw.debtEquity.toFixed(2)} — borrowed money is high vs owned capital.` });
  }
  if (growthClass === 'DECLINING') {
    flags.push({ code: 'GROWTH', title: 'Growth under pressure', note: 'Revenue or profit trends are weak — check latest quarterly results on Screener.in.' });
  }
  if (raw.cmp != null && raw.cmp < 10 && (raw.marketCapCr ?? 0) < 500) {
    flags.push({ code: 'PENNY', title: 'Low-priced small cap', note: 'Very low share price + small size = higher speculation risk. Multibagger stories here are rare and risky.' });
  }

  const moatScores = scoreMoat(raw);
  const trust = scoreTrust(raw);
  const own = ownershipFromCrossCheck(raw.externalSnaps || []);
  const pulseBreakdown = buildPulseBreakdown(raw, verdict, growthClass, moatScores.tier, trust.score, own);
  const pulseScore = pulseBreakdown.filter(b => b.pass).length;
  const quality: PulseQuality = pulseScore >= 7 ? 'STRONG' : pulseScore >= 4 ? 'MODERATE' : 'WEAK';

  const sectionsLive = countLiveSections(raw, acc);
  let dataConfidence: DataConfidence = acc
    ? tightenDataConfidence(raw.crossCheck, acc, sectionsLive)
    : sectionsLive >= 11 ? 'HIGH' : sectionsLive >= 7 ? 'MODERATE' : sectionsLive >= 4 ? 'LOW' : 'VERY_LOW';
  if (!acc) {
    if (raw.crossCheck.overall === 'VERIFIED' && dataConfidence === 'LOW') dataConfidence = 'MODERATE';
    if (raw.crossCheck.overall === 'VERIFIED' && dataConfidence === 'MODERATE') dataConfidence = 'HIGH';
    if (raw.crossCheck.overall === 'LOW' && dataConfidence === 'HIGH') dataConfidence = 'MODERATE';
  }

  if (own.pledgingPct != null && own.pledgingPct > 10) {
    flags.push({
      code: 'PLEDGE',
      title: `Promoter pledging: ${own.pledgingPct.toFixed(1)}%`,
      note: 'Shares pledged as loan collateral — check Trendlyne / Screener.in.',
    });
  }
  for (const m of raw.crossCheck.metrics.filter(x => x.status === 'MISMATCH').slice(0, 3)) {
    flags.push({
      code: `X_${m.key}`,
      title: `Source mismatch: ${m.label}`,
      note: m.note,
    });
  }

  const scenarios = buildScenarios(raw, rev5, rev3, horizonYears);

  return {
    ticker: raw.ticker,
    companyName: raw.companyName,
    sector: raw.sector,
    industry: raw.industry,
    horizonYears,
    generatedAt: Date.now(),
    sources: raw.sources,
    dataConfidence,
    sectionsLive,
    usedTrainingData: raw.usedTrainingData,

    price: {
      cmp: raw.cmp,
      high52: raw.high52,
      low52: raw.low52,
      marketCapCr: raw.marketCapCr,
      bookValue: raw.bookValue,
      faceValue: null,
      rangePosition: rangePosition(raw.cmp, raw.high52, raw.low52),
      asOf: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    },

    valuation: {
      rows,
      verdict,
      summary: valuationSummary(verdict, raw.pe, sectorPeRef),
      buffers: rows.filter(r => r.current != null).map(r => ({
        metric: r.label,
        gapPct: r.current != null && r.own5yAvg != null && r.own5yAvg > 0
          ? ((r.current - r.own5yAvg) / r.own5yAvg) * 100
          : null,
        toOwnAvg: 'Verify 5Y average at Screener.in',
      })),
    },

    growth: {
      class: growthClass,
      revenueCagr3y: rev3,
      revenueCagr5y: rev5,
      profitCagr3y: profit3,
      profitCagr5y: profit5,
      epsCagr3y: profit3,
      marginNote: raw.operatingMargins != null ? `Operating margin ~${raw.operatingMargins.toFixed(1)}%` : '⚠ Not found — check Screener.in',
      summary: acc?.salesCagr3y != null
        ? `Screener compounded sales: ${acc.salesCagr3y}% (3Y) · ${acc.salesCagr5y ?? '—'}% (5Y). Growth reads ${growthClass.replace('_', ' ').toLowerCase()}.`
        : `Growth is ${growthClass.replace('_', ' ').toLowerCase()} based on available financial trends.`,
    },

    health: {
      debtEquity: raw.debtEquity,
      interestCoverage: raw.ebitda != null && raw.totalDebt != null && raw.totalDebt > 0
        ? raw.ebitda / (raw.totalDebt * 0.08)
        : null,
      currentRatio: raw.currentRatio,
      fcfCr: raw.freeCashflow != null ? raw.freeCashflow / 1e7 : null,
      cashCr: raw.totalCash != null ? raw.totalCash / 1e7 : null,
      deSignal: raw.debtEquity == null ? '—' : raw.debtEquity < 0.5 ? 'SAFE' : raw.debtEquity < 1.5 ? 'MODERATE' : 'HIGH DEBT',
      icSignal: 'WATCH',
      crSignal: raw.currentRatio == null ? '—' : raw.currentRatio >= 2 ? 'HEALTHY' : raw.currentRatio >= 1 ? 'OKAY' : 'TIGHT',
      fcfSignal: raw.freeCashflow == null ? '—' : raw.freeCashflow > 0 ? 'GROWING' : 'CONCERN',
      summary: 'Balance sheet view uses Yahoo Finance fundamentals — cross-check debt and cash flow on Screener.in before deciding.',
    },

    returns: {
      roe: raw.roe,
      roe3y: raw.roe,
      roce: raw.roce ?? null,
      divYield: raw.divYield,
      payout: null,
      dividendNote: raw.divYield != null && raw.divYield > 0 ? 'Pays dividend' : 'Reinvesting or no dividend',
      roeFlag: raw.roe == null ? '—' : raw.roe >= 20 ? 'EXCELLENT' : raw.roe >= 15 ? 'GOOD' : raw.roe >= 10 ? 'AVERAGE' : 'WEAK',
    },

    moat: moatScores,
    tailwinds: [`Sector: ${raw.sector} — verify PLI/policy tailwinds on Moneycontrol / ET`],
    headwinds: ['Commodity/input costs and competition — confirm in latest annual report'],

    ownership: {
      promoterPct: own.promoterPct,
      fiiPct: own.fiiPct,
      diiPct: null,
      pledgingPct: own.pledgingPct,
      trustScore: trust.score,
      trustLabel: trust.label,
      mgmtTone: 'MIXED',
      concallPoints: [
        { said: 'Verify latest earnings call on BSE/NSE', means: 'Management tone must be read from primary transcripts' },
      ],
    },

    peers: [],
    peerStanding: 'Verify peers on Screener.in compare tab',
    news: [],

    scenarios,
    flags,

    pulse: {
      score: pulseScore,
      quality,
      oneLiner: `${raw.companyName}: ${quality.toLowerCase()} fundamentals for a ${horizonYears}-year view — not a buy/sell call.`,
      breakdown: pulseBreakdown,
      strengths: pulseBreakdown.filter(b => b.pass).slice(0, 3).map(b => b.label),
      risks: flags.map(f => f.title),
      trackQuarterly: 'Watch next 2 quarters: revenue growth %, debt/equity, and whether margins expand or shrink.',
      opportunities: growthClass === 'ACCELERATING' ? ['Earnings acceleration if sector tailwinds continue'] : ['Stability if execution improves'],
      monitorRisks: flags.length ? flags.map(f => f.note) : ['Macro and sector cycles'],
    },

    metricSources: acc?.metricSources,
    simpleWords: {
      overview: acc?.screenerAbout
        ? acc.screenerAbout.slice(0, 400)
        : `${raw.companyName} operates in ${raw.industry}. Numbers prioritise Screener.in + NSE, cross-checked with Yahoo.`,
      business: 'Read the latest investor presentation on the company website for how money is actually made.',
      valuation: valuationSummary(verdict, raw.pe, sectorPeRef),
      growth: `Think of growth like school marks: recent trend is ${growthClass.toLowerCase()}.`,
      health: 'Can the company pay bills and loans without panic? Cross-check on Screener.in.',
      returns: raw.roe != null ? `For every ₹100 of shareholder money, ROE suggests ~${raw.roe.toFixed(0)}% profit efficiency.` : 'Return metrics need verification.',
      moat: moatScores.strength,
      peers: 'Compare 3 closest competitors on Screener.in — we list placeholders until peer API is wired.',
      owners: 'Promoter/FII/DII trends need Screener.in or Trendlyne — not in free Yahoo feed.',
      pulse: `Fundamental pulse ${pulseScore}/10 — detective view only, you decide.`,
    },

    disclaimer: 'Not investment advice. No buy/sell. Verify all figures at NSE/BSE/Screener.in.',
    crossCheck: raw.crossCheck,
  };
}

function valuationSummary(verdict: ValuationVerdict, pe: number | null, sectorPe: number | null): string {
  if (pe == null) return 'Valuation ratios incomplete — verify at Screener.in.';
  const ref = sectorPe != null ? `sector ~${sectorPe.toFixed(1)}×` : `Nifty ~${getNiftyPeProxy()}×`;
  return `Valuation reads ${verdict.replace('_', ' ').toLowerCase()} with trailing P/E ~${pe.toFixed(1)}× vs ${ref}.`;
}

function scoreMoat(raw: RawFundamentals): MoatBreakdown {
  const brand = raw.marketCapCr != null && raw.marketCapCr > 50000 ? 2 : raw.marketCapCr != null && raw.marketCapCr > 10000 ? 1 : 0;
  const scale = raw.marketCapCr != null && raw.marketCapCr > 30000 ? 2 : 1;
  const cost = raw.operatingMargins != null && raw.operatingMargins > 15 ? 2 : raw.operatingMargins != null && raw.operatingMargins > 8 ? 1 : 0;
  const total = brand + scale + cost;
  const tier: MoatTier = total >= 5 ? 'WIDE' : total >= 3 ? 'NARROW' : 'NONE';
  return {
    brand,
    switching: 0,
    network: 0,
    cost,
    regulatory: 0,
    ip: 0,
    scale,
    total,
    tier,
    strength: tier === 'WIDE' ? 'Large scale and brand in its space' : tier === 'NARROW' ? 'Some cost or scale edge' : 'Moat not obvious from public data alone',
    risk: 'Sector disruption and new entrants — read annual report risk section',
  };
}

function scoreTrust(raw: RawFundamentals): { score: number; label: string } {
  let score = 4;
  if (raw.roe != null && raw.roe > 12) score += 1;
  if (raw.debtEquity != null && raw.debtEquity < 1) score += 1;
  if (raw.revenueGrowth != null && raw.revenueGrowth > 10) score += 1;
  if (raw.profitMargins != null && raw.profitMargins > 5) score += 1;
  score = Math.min(8, Math.max(0, score));
  const label = score >= 7 ? 'HIGH TRUST' : score >= 4 ? 'MODERATE TRUST' : 'LOW TRUST';
  return { score, label };
}

function buildPulseBreakdown(
  raw: RawFundamentals,
  verdict: ValuationVerdict,
  growth: GrowthClass,
  moat: MoatTier,
  trust: number,
  own: { promoterPct: number | null; pledgingPct: number | null },
) {
  const roePass = raw.roe != null ? raw.roe >= 15 : null;
  const rocePass = raw.roce != null ? raw.roce >= 15 : null;
  const profitPass = raw.earningsGrowth != null ? raw.earningsGrowth > 0 : null;
  const promoterPass = own.promoterPct != null ? own.promoterPct >= 25 : null;
  const pledgePass = own.pledgingPct != null ? own.pledgingPct <= 10 : true;

  const items = [
    { label: 'Valuation reasonable vs history', pass: verdict === 'UNDERVALUED' || verdict === 'FAIRLY_VALUED' },
    { label: 'Revenue growth healthy', pass: growth === 'ACCELERATING' || growth === 'STEADY' },
    { label: 'Profit growth healthy', pass: profitPass ?? false },
    { label: 'Balance sheet healthy', pass: raw.debtEquity != null && raw.debtEquity < 1.5 },
    { label: 'ROE above 15%', pass: roePass ?? false },
    { label: 'ROCE above 15%', pass: rocePass ?? false },
    { label: 'Promoter holding stable', pass: promoterPass ?? false },
    { label: 'No pledging red flag', pass: pledgePass },
    { label: 'Moat narrow or wide', pass: moat !== 'NONE' },
    { label: 'Management trust moderate+', pass: trust >= 4 },
  ];

  // Unknown metrics (null) don't count against score — exclude from denominator
  return items.filter(item => {
    if (item.label === 'Profit growth healthy' && profitPass === null) return false;
    if (item.label === 'ROE above 15%' && roePass === null) return false;
    if (item.label === 'ROCE above 15%' && rocePass === null) return false;
    if (item.label === 'Promoter holding stable' && promoterPass === null) return false;
    return true;
  });
}

function countLiveSections(raw: RawFundamentals, acc?: RawFundamentals['accuracy']): number {
  let n = 0;
  if (raw.cmp != null) n++;
  if (raw.pe != null) n++;
  if (raw.roe != null) n++;
  if (raw.roce != null) n++;
  if (raw.debtEquity != null) n++;
  if (raw.revenueGrowth != null || acc?.salesCagr3y != null) n++;
  if (raw.revenueHistory.length > 0 || acc?.salesCagr5y != null) n++;
  if (raw.marketCapCr != null) n++;
  if (raw.high52 != null && raw.low52 != null) n++;
  if (raw.freeCashflow != null) n++;
  if (raw.operatingMargins != null) n++;
  if (raw.divYield != null) n++;
  if (acc?.profitCagr3y != null) n++;
  if (raw.sectorPe != null) n++;
  if (raw.pb != null) n++;
  if (raw.currentRatio != null) n++;
  if (raw.earningsHistory.length > 0) n++;
  return n;
}

function buildScenarios(raw: RawFundamentals, rev5: number | null, rev3: number | null, years: number): ScenarioCase[] {
  const base = rev5 != null && rev3 != null ? (rev5 + rev3) / 2 : rev3 ?? rev5 ?? 8;
  const lastRev = raw.revenueHistory[raw.revenueHistory.length - 1];
  const lastRevCr = lastRev != null ? lastRev / 1e7 : null;
  const proj = (cagrPct: number) => {
    if (lastRevCr == null) return { revenueCr: null, profitCr: null, eps: null };
    const rev = lastRevCr * Math.pow(1 + cagrPct / 100, years);
    const margin = (raw.profitMargins ?? 8) / 100;
    const profit = rev * margin;
    const eps = raw.cmp != null && raw.cmp > 0 ? (profit * 1e7) / (raw.marketCapCr != null ? (raw.marketCapCr * 1e7) / raw.cmp : 1) : null;
    return { revenueCr: Math.round(rev), profitCr: Math.round(profit), eps: eps != null ? Math.round(eps * 100) / 100 : null };
  };
  return [
    { label: 'BEAR', cagrUsed: base - 5, ...proj(base - 5) },
    { label: 'BASE', cagrUsed: base, ...proj(base) },
    { label: 'BULL', cagrUsed: base + 4, ...proj(base + 4) },
  ];
}

/** Multibagger / underrated gem score — illustrative research signal, not price targets. */
export function scoreMultibagger(raw: RawFundamentals): MultibaggerPick | null {
  if (!raw.cmp || raw.cmp <= 0) return null;
  let score = 0;
  const reasons: string[] = [];
  const risks: string[] = [];

  const rev = raw.revenueGrowth ?? cagr(raw.revenueHistory.slice(-4));
  const pos = rangePosition(raw.cmp, raw.high52, raw.low52);
  const mcap = raw.marketCapCr ?? 0;
  const industry = (raw.industry + raw.sector).toLowerCase();

  if (rev != null && rev >= 25) { score += 24; reasons.push(`Revenue growth ~${rev.toFixed(0)}% — accelerating story`); }
  else if (rev != null && rev >= 15) { score += 16; reasons.push(`Revenue growth ~${rev.toFixed(0)}%`); }
  else if (rev != null && rev >= 8) { score += 8; reasons.push(`Steady revenue growth ~${rev.toFixed(0)}%`); }

  if (raw.earningsGrowth != null && raw.earningsGrowth > 20) { score += 20; reasons.push('Earnings growth strong YoY'); }
  else if (raw.earningsGrowth != null && raw.earningsGrowth > 10) { score += 12; reasons.push('Profit improving YoY'); }

  if (raw.pe != null && raw.pe > 0 && raw.pe < 22) {
    score += 18;
    reasons.push(`P/E ~${raw.pe.toFixed(1)}× — growth not fully priced vs Nifty ~${getNiftyPeProxy()}×`);
  } else if (raw.pe != null && raw.pe > 0 && raw.pe < 32) {
    score += 10;
    reasons.push(`P/E ~${raw.pe.toFixed(1)}× — reasonable vs growth`);
  } else if (raw.pe != null && raw.pe > 50) {
    risks.push('High P/E — hype may be priced in');
    score -= 10;
  }

  if (raw.pb != null && raw.pb > 0 && raw.pb < 2.5 && rev != null && rev > 12) {
    score += 8;
    reasons.push(`P/B ~${raw.pb.toFixed(1)}× with growth — undervalued vs book + earnings power`);
  }

  if (mcap >= 800 && mcap <= 20000) {
    score += 16;
    reasons.push(`Mid/small cap (~₹${Math.round(mcap)} Cr) — Moschip-style compounder zone vs mega-caps`);
  } else if (mcap > 20000 && mcap < 80000) {
    score += 6;
    reasons.push('Large mid-cap — still room if execution surprises');
  }
  if (mcap > 0 && mcap < 800) {
    risks.push('Micro-cap — liquidity, governance, and disclosure risk');
    score += 4;
  }

  if (pos === 'BOTTOM') { score += 16; reasons.push('Near 52-week low — underappreciated / contrarian setup'); }
  else if (pos === 'MID') { score += 10; reasons.push('Mid 52-week range — not chasing euphoria'); }
  if (pos === 'TOP') { risks.push('Near 52-week high — less margin of safety'); score -= 6; }

  if (raw.debtEquity != null && raw.debtEquity < 0.6) { score += 12; reasons.push('Low leverage — balance sheet supports growth'); }
  else if (raw.debtEquity != null && raw.debtEquity < 1) { score += 6; reasons.push('Debt/equity manageable'); }
  if (raw.debtEquity != null && raw.debtEquity > 1.5) { risks.push('Leverage elevated'); score -= 12; }

  if (raw.roe != null && raw.roe >= 18) { score += 12; reasons.push(`ROE ~${raw.roe.toFixed(0)}% — capital efficiency strong`); }
  else if (raw.roe != null && raw.roe >= 12) { score += 6; reasons.push(`ROE ~${raw.roe.toFixed(0)}%`); }

  if (/semiconductor|chip|electronic|defence|defense|solar|renewable|it services|software/.test(industry)) {
    score += 6;
    reasons.push('Sector theme: structural demand (verify order book on concall)');
  }

  if (raw.crossCheck.overall === 'VERIFIED') score += 5;

  let attentionScore = 50;
  if (pos === 'BOTTOM') attentionScore += 25;
  if (mcap < 15000) attentionScore += 15;
  if (raw.pe != null && raw.pe < 25) attentionScore += 10;
  attentionScore = Math.min(95, attentionScore);

  score = Math.max(0, Math.min(100, score));
  let tier: MultibaggerTier = 'WATCH';
  let tag = 'Undervalued watch';
  let gemArchetype: GemArchetype = 'GROWTH_COMPOUNDER';

  if (score >= 68) {
    tier = 'CANDIDATE';
    tag = 'Multibagger candidate';
    gemArchetype = 'MULTIBAGGER_CANDIDATE';
  }
  if (score >= 82 && mcap < 12000 && (pos === 'BOTTOM' || pos === 'MID')) {
    tier = 'SPECULATIVE';
    tag = 'Tenbagger watch (high risk)';
    gemArchetype = 'TENBAGGER_WATCH';
  }
  if (score >= 55 && score < 68 && attentionScore >= 65) {
    gemArchetype = 'UNDERRATED_GEM';
    tag = 'Underrated gem';
  }

  if (score < 32) return null;

  const growthThesis =
    gemArchetype === 'UNDERRATED_GEM'
      ? 'Under-the-radar name: reasonable valuation vs growth, not at euphoric highs — verify order book and promoter quality on Screener.in.'
      : gemArchetype === 'TENBAGGER_WATCH'
        ? 'High-risk small/mid cap with strong growth signals — historical 10× names took 7–15 years; most similar stories fail.'
        : 'Compounder profile: growth + manageable balance sheet — multibagger outcomes need years of execution, not months.';

  return {
    ticker: raw.ticker,
    name: raw.companyName,
    price: raw.cmp,
    score,
    tier,
    tag,
    gemArchetype,
    reasons,
    risks: risks.length ? risks : ['Multibaggers are rare — research signal only, not a guarantee'],
    revenueCagr3y: rev,
    pe: raw.pe,
    marketCapCr: raw.marketCapCr,
    growthThesis,
    attentionScore,
    llmEnriched: false,
  };
}
