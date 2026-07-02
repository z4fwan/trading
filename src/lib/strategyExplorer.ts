import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { getEngineState } from './engineState';

export interface StrategyVariant {
  id: string;
  name: string;
  params: Record<string, number>;
  createdAt: number;
  lastUsed: number;
  totalTrades: number;
  wins: number;
  losses: number;
  partials: number;
  accuracy: number;
  avgConfidence: number;
  sharpeEstimate: number;
  score: number;
  isActive: boolean;
  generation: number;
  parentId: string | null;
}

const DEFAULT_VARIANTS: Omit<StrategyVariant, 'id' | 'createdAt' | 'lastUsed' | 'totalTrades' | 'wins' | 'losses' | 'partials' | 'accuracy' | 'avgConfidence' | 'sharpeEstimate' | 'score' | 'isActive' | 'generation' | 'parentId'>[] = [
  { name: 'Conservative', params: { minConfidence: 65, minAdx: 20, maxUncertainty: 40, volatilityLimit: 60, minHistoricalMatches: 3, rsiOversold: 30, rsiOverbought: 70, trendWeight: 1.0, patternWeight: 1.0, sentimentWeight: 0.5 } },
  { name: 'Aggressive', params: { minConfidence: 45, minAdx: 15, maxUncertainty: 60, volatilityLimit: 80, minHistoricalMatches: 1, rsiOversold: 25, rsiOverbought: 75, trendWeight: 1.5, patternWeight: 0.8, sentimentWeight: 0.8 } },
  { name: 'TrendFollower', params: { minConfidence: 55, minAdx: 25, maxUncertainty: 50, volatilityLimit: 70, minHistoricalMatches: 2, rsiOversold: 35, rsiOverbought: 65, trendWeight: 2.0, patternWeight: 0.5, sentimentWeight: 0.3 } },
  { name: 'MeanReversion', params: { minConfidence: 55, minAdx: 10, maxUncertainty: 45, volatilityLimit: 50, minHistoricalMatches: 2, rsiOversold: 40, rsiOverbought: 60, trendWeight: 0.3, patternWeight: 1.5, sentimentWeight: 0.5 } },
  { name: 'Balanced', params: { minConfidence: 50, minAdx: 18, maxUncertainty: 50, volatilityLimit: 65, minHistoricalMatches: 2, rsiOversold: 30, rsiOverbought: 70, trendWeight: 1.0, patternWeight: 1.0, sentimentWeight: 0.6 } },
];

let variants: StrategyVariant[] = [];
let loaded = false;
const STORAGE_KEY = 'strategy_variants';
const MAX_VARIANTS = 20;
const MUTATION_RATE = 0.2;
const EXPLORATION_INTERVAL = 6 * 60 * 60 * 1000;

function loadVariants(): StrategyVariant[] {
  if (loaded) return variants;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      variants = JSON.parse(raw) as StrategyVariant[];
    }
  } catch { /* ignore */ }
  if (variants.length === 0) {
    const now = Date.now();
    variants = DEFAULT_VARIANTS.map((v, i) => ({
      ...v,
      id: `variant_${i}_${now}`,
      createdAt: now,
      lastUsed: now,
      totalTrades: 0, wins: 0, losses: 0, partials: 0,
      accuracy: 0, avgConfidence: 0, sharpeEstimate: 0, score: 50,
      isActive: true, generation: 0, parentId: null,
    }));
  }
  loaded = true;
  saveVariants();
  return variants;
}

function saveVariants(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(variants));
    }
  } catch { /* ignore */ }
}

function generateId(): string {
  return `sv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function mutateParams(base: Record<string, number>): Record<string, number> {
  const mutated: Record<string, number> = {};
  for (const [key, val] of Object.entries(base)) {
    const noise = (Math.random() - 0.5) * 2 * MUTATION_RATE * val;
    mutated[key] = Math.round(Math.max(1, val + noise) * 10) / 10;
  }
  return mutated;
}

function crossoverParams(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const child: Record<string, number> = {};
  for (const key of Object.keys(a)) {
    child[key] = Math.random() > 0.5 ? a[key] : b[key];
  }
  return child;
}

function computeScore(v: StrategyVariant): number {
  if (v.totalTrades === 0) return 50;

  const accuracyScore = v.accuracy * 0.4;
  const sharpeScore = Math.min(50, Math.max(0, (v.sharpeEstimate + 1) * 20)) * 0.2;
  const confidenceScore = (100 - Math.abs(v.avgConfidence - v.accuracy)) * 0.15;
  const volumeScore = Math.min(25, v.totalTrades * 2) * 0.15;
  const recencyScore = 10 * 0.1;

  return Math.round(accuracyScore + sharpeScore + confidenceScore + volumeScore + recencyScore);
}

export function recordStrategyResult(
  variantId: string,
  wasCorrect: boolean,
  isPartial: boolean,
  confidence: number,
): void {
  const v = loadVariants().find(x => x.id === variantId);
  if (!v) return;

  v.lastUsed = Date.now();
  v.totalTrades++;
  v.avgConfidence = ((v.avgConfidence * (v.totalTrades - 1)) + confidence) / v.totalTrades;

  if (isPartial) v.partials++;
  else if (wasCorrect) v.wins++;
  else v.losses++;

  const relevant = v.wins + v.losses;
  v.accuracy = relevant > 0 ? (v.wins / relevant) * 100 : 0;

  const winRate = relevant > 0 ? v.wins / relevant : 0;
  const lossRate = relevant > 0 ? v.losses / relevant : 0;
  const expectedReturn = winRate - lossRate;
  const returnVariance = (winRate * (1 - winRate) + lossRate * (1 - lossRate)) || 0.01;
  v.sharpeEstimate = returnVariance > 0 ? expectedReturn / Math.sqrt(returnVariance) : 0;

  v.score = computeScore(v);
  saveVariants();
}

export function getBestVariant(): StrategyVariant | null {
  const active = loadVariants().filter(v => v.isActive && v.totalTrades >= 3);
  if (active.length === 0) return variants.find(v => v.name === 'Balanced') || variants[0] || null;
  return active.sort((a, b) => b.score - a.score)[0];
}

export function getVariantById(id: string): StrategyVariant | undefined {
  return loadVariants().find(v => v.id === id);
}

export function selectVariantForTicker(ticker: string): StrategyVariant {
  const all = loadVariants();
  const active = all.filter(v => v.isActive);
  if (active.length === 0) return all[0];

  const predictions = getResolvedPredictions().filter(p => p.ticker === ticker);
  if (predictions.length < 5) return active[0];

  const tickerAccuracy: Record<string, number> = {};
  for (const v of active) {
    const tickerPreds = predictions.filter(p => p.source === v.id);
    if (tickerPreds.length >= 2) {
      const correct = tickerPreds.filter(p => p.result === 'CORRECT').length;
      tickerAccuracy[v.id] = (correct / tickerPreds.length) * 100;
    }
  }

  const scored = active
    .map(v => ({ variant: v, score: tickerAccuracy[v.id] !== undefined ? tickerAccuracy[v.id] * 0.6 + v.score * 0.4 : v.score }))
    .sort((a, b) => b.score - a.score);

  return scored[0].variant;
}

export function runExploration(): string[] {
  const all = loadVariants();
  const now = Date.now();
  const lastExploration = all.length > DEFAULT_VARIANTS.length
    ? Math.max(...all.map(v => v.createdAt))
    : 0;

  if (now - lastExploration < EXPLORATION_INTERVAL) return [];
  if (all.length >= MAX_VARIANTS) {
    const sorted = all.sort((a, b) => b.score - a.score);
    const toRemove = sorted.slice(MAX_VARIANTS - 3);
    for (const r of toRemove) {
      r.isActive = false;
    }
  }

  const top = all.sort((a, b) => b.score - a.score).slice(0, 3);
  const best = top[0];
  const newVariants: StrategyVariant[] = [];
  const log: string[] = [];

  const top2 = top.length > 1 ? top[1] : best;
  const childParams = crossoverParams(best.params, top2.params);
  const mutatedChild = mutateParams(childParams);
  const child: StrategyVariant = {
    id: generateId(),
    name: `Explorer_${best.name}_${top2.name}_gen${best.generation + 1}`,
    params: mutatedChild,
    createdAt: now, lastUsed: now,
    totalTrades: 0, wins: 0, losses: 0, partials: 0,
    accuracy: 0, avgConfidence: 0, sharpeEstimate: 0, score: 50,
    isActive: true, generation: best.generation + 1, parentId: best.id,
  };
  newVariants.push(child);
  log.push(`Explored: ${child.name} (crossover of ${best.name} + ${top2.name})`);

  const pureMutation: StrategyVariant = {
    id: generateId(),
    name: `Mutant_${best.name}_gen${best.generation + 1}`,
    params: mutateParams(best.params),
    createdAt: now, lastUsed: now,
    totalTrades: 0, wins: 0, losses: 0, partials: 0,
    accuracy: 0, avgConfidence: 0, sharpeEstimate: 0, score: 50,
    isActive: true, generation: best.generation + 1, parentId: best.id,
  };
  newVariants.push(pureMutation);
  log.push(`Explored: ${pureMutation.name} (mutated from ${best.name})`);

  variants.push(...newVariants);
  saveVariants();

  return log;
}

export function getStrategyReport(): string {
  const all = loadVariants();
  const active = all.filter(v => v.isActive);
  const sorted = active.sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  lines.push(`=== Strategy Explorer Report ===`);
  lines.push(`Total variants: ${all.length} (${active.length} active, ${all.length - active.length} retired)`);
  lines.push('');
  lines.push(`Rankings:`);
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const gen = v.generation > 0 ? ` gen${v.generation}` : '';
    lines.push(`  ${i + 1}. ${v.name}${gen} — score: ${v.score}, acc: ${v.accuracy.toFixed(1)}%, trades: ${v.totalTrades}, Sharpe: ${v.sharpeEstimate.toFixed(2)}`);
  }

  const best = sorted[0];
  if (best) {
    lines.push('');
    lines.push(`Best variant: ${best.name}`);
    lines.push(`Parameters: ${JSON.stringify(best.params)}`);
  }

  return lines.join('\n');
}

export function getStrategyStats(): { active: number; total: number; bestScore: number; bestName: string } {
  const all = loadVariants();
  const active = all.filter(v => v.isActive).length;
  const best = all.sort((a, b) => b.score - a.score)[0];
  return { active, total: all.length, bestScore: best?.score || 0, bestName: best?.name || 'none' };
}
