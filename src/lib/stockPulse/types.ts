export type ValuationSignal = 'CHEAP' | 'FAIR' | 'RICH';
export type ValuationVerdict = 'UNDERVALUED' | 'FAIRLY_VALUED' | 'OVERVALUED' | 'MIXED';
export type GrowthClass = 'ACCELERATING' | 'STEADY' | 'SLOWING' | 'DECLINING';
export type MoatTier = 'WIDE' | 'NARROW' | 'NONE';
export type PulseQuality = 'STRONG' | 'MODERATE' | 'WEAK';
export type DataConfidence = 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';
export type MultibaggerTier = 'WATCH' | 'CANDIDATE' | 'SPECULATIVE';

export interface SourceRef {
  name: string;
  url: string;
}

export type CrossCheckStatus = 'AGREE' | 'CLOSE' | 'MISMATCH' | 'SINGLE_SOURCE';

export interface CrossCheckMetric {
  key: string;
  label: string;
  unit: string;
  readings: { source: string; value: number | null; display: string }[];
  status: CrossCheckStatus;
  adopted: number | null;
  note: string;
}

export interface CrossCheckResult {
  ranAt: number;
  metrics: CrossCheckMetric[];
  sourcesQueried: string[];
  sourcesResponded: string[];
  verifiedCount: number;
  mismatchCount: number;
  overall: 'VERIFIED' | 'PARTIAL' | 'LOW';
}

export interface RatioRow {
  label: string;
  current: number | null;
  sectorAvg: number | null;
  own5yAvg: number | null;
  niftyAvg: number | null;
  signal: ValuationSignal | null;
  explain?: string;
  source?: string;
}

export interface FlagItem {
  code: string;
  title: string;
  note: string;
}

export interface MoatBreakdown {
  brand: number;
  switching: number;
  network: number;
  cost: number;
  regulatory: number;
  ip: number;
  scale: number;
  total: number;
  tier: MoatTier;
  strength: string;
  risk: string;
}

export interface ScenarioCase {
  label: 'BEAR' | 'BASE' | 'BULL';
  revenueCr: number | null;
  profitCr: number | null;
  eps: number | null;
  cagrUsed: number;
}

export interface PeerRow {
  ticker: string;
  name: string;
  isSubject: boolean;
  marketCapCr: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  revGrowth: number | null;
  de: number | null;
  edge: string;
}

export interface EpsQuarterRow {
  quarter: string;
  eps: number | null;
  yoyPct: number | null;
}

export interface DividendYearRow {
  year: string;
  amount: number | null;
  payoutPct: number | null;
}

export interface StockPulseReport {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  horizonYears: number;
  generatedAt: number;
  sources: SourceRef[];
  dataConfidence: DataConfidence;
  sectionsLive: number;
  businessBlurb?: string;
  epsQuarters?: EpsQuarterRow[];
  dividendHistory?: DividendYearRow[];
  dalalaiIntelligence?: any;

  price: {
    cmp: number | null;
    high52: number | null;
    low52: number | null;
    marketCapCr: number | null;
    bookValue: number | null;
    faceValue: number | null;
    rangePosition: 'TOP' | 'MID' | 'BOTTOM' | null;
    asOf: string;
  };

  valuation: {
    rows: RatioRow[];
    verdict: ValuationVerdict;
    summary: string;
    buffers: { metric: string; gapPct: number | null; toOwnAvg: string }[];
  };

  growth: {
    class: GrowthClass;
    revenueCagr3y: number | null;
    revenueCagr5y: number | null;
    profitCagr3y: number | null;
    profitCagr5y: number | null;
    epsCagr3y: number | null;
    marginNote: string;
    summary: string;
  };

  health: {
    debtEquity: number | null;
    interestCoverage: number | null;
    currentRatio: number | null;
    fcfCr: number | null;
    cashCr: number | null;
    deSignal: string;
    icSignal: string;
    crSignal: string;
    fcfSignal: string;
    summary: string;
  };

  returns: {
    roe: number | null;
    roe3y: number | null;
    roce: number | null;
    divYield: number | null;
    payout: number | null;
    dividendNote: string;
    roeFlag: string;
  };

  moat: MoatBreakdown;
  tailwinds: string[];
  headwinds: string[];

  ownership: {
    promoterPct: number | null;
    fiiPct: number | null;
    diiPct: number | null;
    pledgingPct: number | null;
    trustScore: number;
    trustLabel: string;
    mgmtTone: string;
    concallPoints: { said: string; means: string }[];
  };

  peers: PeerRow[];
  peerStanding: string;
  news: { headline: string; why: string; date: string; source: string }[];

  scenarios: ScenarioCase[];
  flags: FlagItem[];

  pulse: {
    score: number;
    quality: PulseQuality;
    oneLiner: string;
    breakdown: { label: string; pass: boolean }[];
    strengths: string[];
    risks: string[];
    trackQuarterly: string;
    opportunities: string[];
    monitorRisks: string[];
  };

  simpleWords: Record<string, string>;
  disclaimer: string;
  usedTrainingData: boolean;
  crossCheck: CrossCheckResult;
  metricSources?: Record<string, string>;
}

export type GemArchetype = 'UNDERRATED_GEM' | 'MULTIBAGGER_CANDIDATE' | 'TENBAGGER_WATCH' | 'GROWTH_COMPOUNDER';

export interface MultibaggerPick {
  ticker: string;
  name: string;
  price: number;
  score: number;
  tier: MultibaggerTier;
  tag: string;
  gemArchetype?: GemArchetype;
  reasons: string[];
  risks: string[];
  revenueCagr3y: number | null;
  pe: number | null;
  marketCapCr: number | null;
  /** Illustrative only — not a price target */
  growthThesis: string;
  /** Deep qualitative note (LLM when configured) */
  deepAnalysis?: string;
  undervaluationNote?: string;
  growthOutlook?: string;
  sectorTheme?: string;
  /** e.g. "15–25% revenue CAGR band if execution holds" */
  expectedCagrBand?: string;
  attentionScore?: number;
  llmEnriched?: boolean;
}

export interface StockPulseMemory {
  ticker: string;
  snapshots: { at: number; pulseScore: number; verdict: ValuationVerdict; growth: GrowthClass }[];
  lastReport?: StockPulseReport;
  analysisCount: number;
  updatedAt: number;
}
