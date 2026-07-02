// Web Worker: offloads heavy TA computation from the main thread
// No DOM/React/import.meta — pure computation only

import { calculateIndicators, buildCandleHistory, detectSmartMoney } from '@/lib/technicalAnalysis';
import type { OHLC, TAIndicators } from '@/lib/technicalAnalysis';
import type { SmartMoneySignal } from '@/lib/technicalAnalysis';
import { computeModelParams } from '@/lib/mlEngine';
import type { MLModel } from '@/lib/mlEngine';

interface ComputeInput {
  type: 'COMPUTE_INDICATORS';
  tickers: string[];
  histories: Record<string, OHLC[]>;
  prices: Record<string, { price: number; volume: number; prevClose: number }>;
  sessionHighs: Record<string, { high: number; low: number }>;
}

interface ComputeResult {
  type: 'INDICATORS_RESULT';
  indicators: Record<string, TAIndicators>;
  smartMoney: Record<string, SmartMoneySignal>;
  errors: Record<string, string>;
}

interface TrainInput {
  type: 'TRAIN_MODEL';
  ticker: string;
  candles: OHLC[];
  forwardDays?: number;
}

interface TrainResult {
  type: 'TRAIN_RESULT';
  ticker: string;
  model: (Omit<MLModel, 'trainedAt'> & { trainedAt: number }) | null;
  error?: string;
}

self.onmessage = (e: MessageEvent<ComputeInput | TrainInput>) => {
  if (e.data.type === 'COMPUTE_INDICATORS') {
    handleCompute(e.data);
  } else if (e.data.type === 'TRAIN_MODEL') {
    handleTrain(e.data);
  }
};

function handleCompute(data: ComputeInput) {
  const { tickers, histories, prices, sessionHighs } = data;
  const indicators: Record<string, TAIndicators> = {};
  const smartMoney: Record<string, SmartMoneySignal> = {};
  const errors: Record<string, string> = {};

  for (const ticker of tickers) {
    try {
      const hist = histories[ticker];
      const priceData = prices[ticker];
      const hl = sessionHighs[ticker];

      if (!hist || hist.length < 50 || !priceData || priceData.price <= 0) {
        continue;
      }

      const candles = buildCandleHistory(
        hist,
        priceData.price,
        priceData.volume,
        priceData.prevClose,
        hl?.high,
        hl?.low,
      );

      if (candles.length < 50) continue;

      const ta = calculateIndicators(candles);
      if (ta) {
        indicators[ticker] = ta;
        smartMoney[ticker] = detectSmartMoney(candles, ta);
      }
    } catch (err) {
      errors[ticker] = err instanceof Error ? err.message : String(err);
    }
  }

  const result: ComputeResult = { type: 'INDICATORS_RESULT', indicators, smartMoney, errors };
  self.postMessage(result);
}

function handleTrain(data: TrainInput) {
  try {
    const result = computeModelParams(data.ticker, data.candles, data.forwardDays);
    const model = result ? { ...result.model, trainedAt: Date.now() } : null;
    const response: TrainResult = { type: 'TRAIN_RESULT', ticker: data.ticker, model };
    self.postMessage(response);
  } catch (err) {
    const response: TrainResult = {
      type: 'TRAIN_RESULT',
      ticker: data.ticker,
      model: null,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
}
