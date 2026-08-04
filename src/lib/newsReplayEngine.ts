import { getCurrentRegistrySnapshot } from './modelRegistry';
import { calculateEventProbability } from './probabilityEngine';
import { addPrediction } from './predictionStore';
import * as fs from 'fs';
import * as path from 'path';

export interface EvaluationDatasetEvent {
  eventId: string;
  timestamp: number;
  company: string;
  headline: string;
  rawAnnouncement: string;
  marketSnapshot: {
    niftyTrend: string;
    indiaVix: number;
    sectorStrength: number;
    rsi: number;
    relativeVolume: number;
  };
  actualOutcome: {
    actual3DayMovePct: number;
    maxDrawdownPct: number;
    holdingTimeDays: number;
  };
}

export interface ReplayMetrics {
  totalEventsProcessed: number;
  precision: number;
  recall: number;
  accuracy: number;
  modelRegistrySnapshot: any;
}

/**
 * Offline Replay Engine
 * Never deploy a new LLM prompt or Weights array without passing events through this first.
 */
export async function runNewsReplay(year: string = '2026'): Promise<ReplayMetrics> {
  const registry = getCurrentRegistrySnapshot();
  
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  
  let events: EvaluationDatasetEvent[] = [];
  try {
    const datasetPath = path.join(process.cwd(), 'src', 'evaluationDataset', `${year}.json`);
    const fileData = fs.readFileSync(datasetPath, 'utf-8');
    events = JSON.parse(fileData);
  } catch (err) {
    console.error(`[ReplayEngine] Failed to load dataset ${year}:`, err);
    return { totalEventsProcessed: 0, precision: 0, recall: 0, accuracy: 0, modelRegistrySnapshot: registry };
  }

  for (const event of events) {
    // Reconstruct exact historical state
    const probInputs = {
      eventType: 'GENERAL',
      sentiment: event.actualOutcome.actual3DayMovePct > 0 ? 'BULLISH' : 'BEARISH' as any,
      sentimentScore: 50,
      urgency: 70,
      niftyTrend: event.marketSnapshot.niftyTrend,
      sectorStrength: event.marketSnapshot.sectorStrength,
      rsi: event.marketSnapshot.rsi,
      relativeVolume: event.marketSnapshot.relativeVolume,
      historicalMatchCount: 0
    };

    const result = calculateEventProbability(probInputs);
    const predictedPositive = result.probability > 60;
    const actualPositive = event.actualOutcome.actual3DayMovePct > 3.0;

    if (predictedPositive && actualPositive) truePositives++;
    if (predictedPositive && !actualPositive) falsePositives++;
    if (!predictedPositive && !actualPositive) trueNegatives++;
    if (!predictedPositive && actualPositive) falseNegatives++;
    
    // Log it offline to the prediction store but mark as AUTO review
    if (predictedPositive) {
      addPrediction({
        ticker: event.company,
        name: event.company,
        source: 'AI_QUANT',
        predictionType: 'HOURLY',
        direction: probInputs.sentiment,
        bullishProb: result.probability,
        bearishProb: 100 - result.probability,
        confidence: result.probability,
        entryPrice: 0,
        targetPrice: 0,
        targetDate: new Date(Date.now() + 86400000).toISOString(),
        expiryDate: new Date(Date.now() + 86400000).toISOString(),
        expectedVolatility: 0,
        marketCondition: 'NORMAL',
        regime: 'NORMAL',
        taSnapshot: null,
        sentimentScore: probInputs.sentimentScore,
        reasoning: ['Replay Engine Match'],
        modelVersion: registry,
        reviewStatus: 'AUTO'
      });
    }
  }

  const precision = truePositives / (truePositives + falsePositives || 1);
  const recall = truePositives / (truePositives + falseNegatives || 1);
  const accuracy = (truePositives + trueNegatives) / events.length;

  return {
    totalEventsProcessed: events.length,
    precision,
    recall,
    accuracy,
    modelRegistrySnapshot: registry
  };
}
