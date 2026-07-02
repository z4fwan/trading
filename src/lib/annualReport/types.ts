export type ReportKind = 'demo' | 'monthly' | 'financial_year';

export interface ReportPeriod {
  kind: ReportKind;
  label: string;
  startMs: number;
  endMs: number;
  financialYear?: string;
}

export interface AccuracySlice {
  label: string;
  count: number;
  pct: number;
}

export interface TickerOutcome {
  ticker: string;
  name: string;
  pnlPct: number;
  result: string;
  confidence: number;
}

export interface AnnualReportData {
  period: ReportPeriod;
  generatedAt: number;
  brand: string;
  recipientEmail: string;

  executiveSummary: string[];

  predictionStats: {
    total: number;
    resolved: number;
    correct: number;
    wrong: number;
    partial: number;
    overallAccuracy: number;
    byHorizon: AccuracySlice[];
    outcomeSlices: AccuracySlice[];
  };

  topWinners: TickerOutcome[];
  topLosers: TickerOutcome[];
  undervaluedGems: { ticker: string; name: string; score: number; tier: string; thesis: string }[];
  suddenMovers: { ticker: string; name: string; changePct: number; price: number }[];

  learning: {
    progress: string;
    patternsLearned: string[];
    efficiencyActions: string[];
    indicatorAccuracy: { name: string; accuracy: number }[];
    failurePatterns: string[];
    weightSamples: number;
  };

  market: {
    macroActive: boolean;
    brief: string;
    headlines: string[];
    newsAnalyzed: number;
  };

  engine: {
    running: boolean;
    uptimeDays: number;
    quoteCycles: number;
    newsCycles: number;
    mlCycles: number;
    aiCycles: number;
    stockPulseCycles: number;
    gemsCached: number;
    studiedTickers: number;
  };

  accuracyTrend?: { label: string; accuracy: number }[];
}
