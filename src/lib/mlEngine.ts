import { type OHLC } from '@/lib/technicalAnalysis';
import { clampConfidence, MAX_CONFIDENCE } from './confidenceConfig';

// === Feature Extraction ===
export interface MLFeatures {
  rsi: number;
  macdHistogram: number;
  macdLine: number;
  ema20: number;
  ema50: number;
  bbWidth: number;
  bbPosition: number;
  atrRatio: number;
  adx: number;
  stochRsi: number;
  volumeRatio: number;
  priceVsVwap: number;
  supertrendDir: number;
  distToSupport: number;
  distToResistance: number;
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[], mean: number): number {
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function emaCalc(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = avg(values.slice(0, period));
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function smaCalc(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    result.push(avg(values.slice(i - period + 1, i + 1)));
  }
  return result;
}

function tr(candles: OHLC[]): number[] {
  const result: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    result.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev),
    ));
  }
  return result;
}

export function extractFeatures(candles: OHLC[]): number[][] {
  if (candles.length < 60) return [];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const trueRanges = tr(candles);
  const features: number[][] = [];

  for (let i = 60; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const wCloses = closes.slice(0, i + 1);
    const wVolumes = volumes.slice(0, i + 1);
    const wHighs = highs.slice(0, i + 1);
    const wLows = lows.slice(0, i + 1);
    const len = i + 1;
    const lastClose = wCloses[len - 1];

    // RSI(14)
    const rsiPeriod = 14;
    const gains: number[] = [];
    const losses: number[] = [];
    for (let j = 1; j < wCloses.length; j++) {
      const diff = wCloses[j] - wCloses[j - 1];
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }
    const avgGain = avg(gains.slice(0, rsiPeriod));
    const avgLoss = avg(losses.slice(0, rsiPeriod));
    let currentAvgGain = avgGain;
    let currentAvgLoss = avgLoss;
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    for (let j = rsiPeriod; j < gains.length; j++) {
      currentAvgGain = (currentAvgGain * (rsiPeriod - 1) + gains[j]) / rsiPeriod;
      currentAvgLoss = (currentAvgLoss * (rsiPeriod - 1) + losses[j]) / rsiPeriod;
      rs = currentAvgLoss === 0 ? 100 : currentAvgGain / currentAvgLoss;
    }
    const rsi = 100 - 100 / (1 + rs);

    // MACD
    const ema12 = emaCalc(wCloses.slice(-40), 12);
    const ema26 = emaCalc(wCloses.slice(-52), 26);
    const macdLine = ema12.length > 0 && ema26.length > 0 ? ema12[ema12.length - 1] - ema26[ema26.length - 1] : 0;
    const macdValues: number[] = [];
    for (let j = 0; j < Math.min(ema12.length, ema26.length); j++) {
      macdValues.push(ema12[j] - ema26[j]);
    }
    const macdSignalArr = emaCalc(macdValues, 9);
    const macdSignal = macdSignalArr.length > 0 ? macdSignalArr[macdSignalArr.length - 1] : 0;
    const macdHistogram = macdLine - macdSignal;

    // EMA
    const ema20Arr = emaCalc(wCloses.slice(-40), 20);
    const ema50Arr = emaCalc(wCloses.slice(-70), 50);
    const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : lastClose;
    const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : lastClose;

    // Bollinger Bands
    const bbPeriod = 20;
    const bbSma = smaCalc(wCloses.slice(-bbPeriod), bbPeriod);
    const bbMean = bbSma.length > 0 ? bbSma[bbSma.length - 1] : lastClose;
    const bbSlice = wCloses.slice(-bbPeriod);
    const bbStd = stdDev(bbSlice, bbMean);
    const bbUpper = bbMean + 2 * bbStd;
    const bbLower = bbMean - 2 * bbStd;
    const bbWidth = bbMean > 0 ? ((bbUpper - bbLower) / bbMean) * 100 : 0;
    const bbPosition = bbUpper > bbLower ? (lastClose - bbLower) / (bbUpper - bbLower) : 0.5;

    // ATR
    const atrSlice = trueRanges.slice(-14);
    const atr = avg(atrSlice);
    const atrRatio = lastClose > 0 ? atr / lastClose : 0;

    // ADX — time-aligned: upMove[j] ← candle j→j+1, alignedTR[j] ← trueRanges[j+1]
    const adxPeriod = 14;
    const upMove: number[] = [];
    const downMove: number[] = [];
    for (let j = 1; j < wCloses.length; j++) {
      upMove.push(wHighs[j] - wHighs[j - 1]);
      downMove.push(wLows[j - 1] - wLows[j]);
    }
    const alignedTR = trueRanges.slice(1, len); // same length as upMove, same time alignment
    const dx: number[] = [];
    for (let j = 0; j < upMove.length; j++) {
      const plusDM = upMove[j] > downMove[j] && upMove[j] > 0 ? upMove[j] : 0;
      const minusDM = downMove[j] > upMove[j] && downMove[j] > 0 ? downMove[j] : 0;
      const tr14 = avg(alignedTR.slice(Math.max(0, j - adxPeriod + 1), j + 1));
      if (tr14 === 0) continue;
      const plusDI = 100 * (plusDM / tr14);
      const minusDI = 100 * (minusDM / tr14);
      const dxVal = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001);
      dx.push(dxVal);
    }
    const adx = dx.length >= adxPeriod ? avg(dx.slice(-adxPeriod)) : 25;

    // StochRSI
    const stochPeriod = 14;
    const stochSlice = wCloses.slice(-stochPeriod * 2);
    const rsiValues: number[] = [];
    for (let j = stochPeriod; j < stochSlice.length; j++) {
      const window = stochSlice.slice(j - stochPeriod, j + 1);
      const g: number[] = [];
      const l: number[] = [];
      for (let k = 1; k < window.length; k++) {
        const d = window[k] - window[k - 1];
        g.push(Math.max(0, d));
        l.push(Math.max(0, -d));
      }
      const ag = avg(g);
      const al = avg(l);
      const r = al === 0 ? 100 : ag / al;
      rsiValues.push(100 - 100 / (1 + r));
    }
    const recentRsiVals = rsiValues.slice(-stochPeriod);
    let stochRsi: number;
    if (recentRsiVals.length === 0) {
      stochRsi = 50;
    } else {
      const minRsi = Math.min(...recentRsiVals);
      const maxRsi = Math.max(...recentRsiVals);
      stochRsi = maxRsi === minRsi ? 50 : ((rsiValues[rsiValues.length - 1] - minRsi) / (maxRsi - minRsi)) * 100;
    }

    // Volume ratio
    const recentVol = avg(wVolumes.slice(-5));
    const olderVol = avg(wVolumes.slice(-15, -5));
    const volumeRatio = olderVol > 0 ? recentVol / olderVol : 1;

    // VWAP
    let pvSum = 0, volSum = 0;
    for (let j = Math.max(0, len - 20); j < len; j++) {
      const typ = (window[j].high + window[j].low + window[j].close) / 3;
      pvSum += typ * window[j].volume;
      volSum += window[j].volume;
    }
    const vwap = volSum > 0 ? pvSum / volSum : lastClose;
    const priceVsVwap = vwap > 0 ? (lastClose - vwap) / vwap : 0;

    // Supertrend (ATR multiplier 3, period 10) — standard carry-forward bands.
    // Previous code only built the UPPER band (hlAvg + 3*ATR) and labelled
    // every price below it "down" (~always), biasing ML features bearish.
    const stPeriod = 10;
    const stMult = 3;
    let stUpper = 0;
    let stLower = 0;
    let stDir = 'up';
    for (let j = stPeriod; j < len; j++) {
      const atrJ = avg(trueRanges.slice(j - stPeriod, j));
      const hlj = (wHighs[j] + wLows[j]) / 2;
      const upper = hlj + stMult * atrJ;
      const lower = hlj - stMult * atrJ;
      const cj = wCloses[j];
      if (j === stPeriod) {
        stUpper = upper;
        stLower = lower;
        stDir = cj > lower ? 'up' : 'down';
      } else {
        stUpper = (stUpper === upper || cj > stUpper) ? upper : stUpper;
        stLower = (stLower === lower || cj < stLower) ? lower : stLower;
        if (cj > stLower) stDir = 'up';
        else if (cj < stUpper) stDir = 'down';
      }
    }
    const supertrendDir = stDir === 'up' ? 1 : 0;

    // Support / Resistance
    const lookback = 30;
    const recentCloses = wCloses.slice(-lookback);
    const sortedCloses = [...recentCloses].sort((a, b) => a - b);
    const support = sortedCloses[Math.floor(sortedCloses.length * 0.1)] || wLows[wLows.length - 1];
    const resistance = sortedCloses[Math.floor(sortedCloses.length * 0.9)] || wHighs[wHighs.length - 1];
    const distToSupport = support > 0 ? (lastClose - support) / support : 0;
    const distToResistance = resistance > 0 ? (resistance - lastClose) / resistance : 0;

    features.push([
      rsi,
      macdHistogram,
      macdLine,
      ema20,
      ema50,
      bbWidth,
      bbPosition,
      atrRatio,
      adx,
      stochRsi,
      volumeRatio,
      priceVsVwap,
      supertrendDir,
      distToSupport,
      distToResistance,
    ]);
  }

  return features;
}

// === Standardization ===
export function computeStats(features: number[][]): { mean: number[]; std: number[] } {
  const n = features.length;
  const dim = features[0].length;
  const mean = new Array(dim).fill(0);
  for (let j = 0; j < dim; j++) {
    for (let i = 0; i < n; i++) mean[j] += features[i][j];
    mean[j] /= n;
  }
  const std = new Array(dim).fill(0);
  for (let j = 0; j < dim; j++) {
    for (let i = 0; i < n; i++) std[j] += (features[i][j] - mean[j]) ** 2;
    std[j] = Math.max(1e-8, Math.sqrt(std[j] / n));
  }
  return { mean, std };
}

export function standardize(features: number[][], mean: number[], std: number[]): number[][] {
  return features.map(f => f.map((v, j) => (v - mean[j]) / std[j]));
}

// === Logistic Regression ===
export function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

interface LRConfig {
  learningRate: number;
  epochs: number;
  l2: number;
  batchSize: number;
}

export function fitLogisticRegression(
  features: number[][],
  labels: number[],
  config: Partial<LRConfig> = {},
): number[] {
  const { learningRate = 0.01, epochs = 500, l2 = 0.01, batchSize = 32 } = config;
  const n = features.length;
  const dim = features[0].length;
  const weights = new Array(dim).fill(0);

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Mini-batch
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let start = 0; start < n; start += batchSize) {
      const batchIdx = indices.slice(start, Math.min(start + batchSize, n));
      const grad = new Array(dim).fill(0);
      for (const idx of batchIdx) {
        const x = features[idx];
        const y = labels[idx];
        const z = x.reduce((s, v, j) => s + v * weights[j], 0);
        const pred = sigmoid(z);
        const error = pred - y;
        for (let j = 0; j < dim; j++) {
          grad[j] += error * x[j];
        }
      }
      // Average gradient + L2 regularization
      for (let j = 0; j < dim; j++) {
        grad[j] = grad[j] / batchIdx.length + l2 * weights[j];
        weights[j] -= learningRate * grad[j];
      }
    }
  }

  return weights;
}

// === Platt Scaling ===
export function plattCalibrate(
  rawScores: number[],
  labels: number[],
): { a: number; b: number } {
  let a = 0, b = 0;
  const lr = 0.01;
  const epochs = 100;
  const n = rawScores.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0, gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = a * rawScores[i] + b;
      const p = sigmoid(z);
      gradA += rawScores[i] * (p - labels[i]);
      gradB += (p - labels[i]);
    }
    a -= lr * gradA / n;
    b -= lr * gradB / n;
  }

  return { a, b };
}

export function calibrateProbability(rawScore: number, a: number, b: number): number {
  return sigmoid(a * rawScore + b);
}

// === Walk-Forward Validation ===
export interface WalkForwardResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  avgConfidence: number;
  totalWindows: number;
}

export function walkForwardValidation(
  allFeatures: number[][],
  allLabels: number[],
  nWindows = 5,
): WalkForwardResult {
  const n = allFeatures.length;
  if (n < 100) return { accuracy: 0, precision: 0, recall: 0, f1: 0, avgConfidence: 0, totalWindows: 0 };

  const windowSize = Math.floor(n / nWindows);
  const minTrain = Math.floor(n * 0.6);
  let totalCorrect = 0, totalPreds = 0;
  let tp = 0, fp = 0, fn = 0;
  let totalConf = 0;

  for (let w = 0; w < nWindows; w++) {
    const testStart = Math.max(minTrain, windowSize * w);
    const testEnd = Math.min(n, testStart + windowSize);
    if (testEnd - testStart < 20) continue;

    const trainX = allFeatures.slice(0, testStart);
    const trainY = allLabels.slice(0, testStart);
    const testX = allFeatures.slice(testStart, testEnd);
    const testY = allLabels.slice(testStart, testEnd);

    if (trainX.length < 60) continue;

    // Standardize training data (match actual training pipeline)
    const { mean, std } = computeStats(trainX);
    const trainXStd = standardize(trainX, mean, std);

    // Train on standardized training window
    const weights = fitLogisticRegression(trainXStd, trainY);

    // Standardize test data using the same stats
    const testXStd = standardize(testX, mean, std);

    // Evaluate
    for (let i = 0; i < testXStd.length; i++) {
      const z = testXStd[i].reduce((s, v, j) => s + v * weights[j], 0);
      const predProb = sigmoid(z);
      const predLabel = predProb >= 0.5 ? 1 : 0;
      const actual = testY[i];

      totalPreds++;
      totalConf += Math.abs(predProb - 0.5) * 2;

      if (predLabel === actual) {
        totalCorrect++;
        if (predLabel === 1) tp++;
        else { /* tn */ }
      } else {
        if (predLabel === 1) fp++;
        else fn++;
      }
    }
  }

  if (totalPreds === 0) return { accuracy: 0, precision: 0, recall: 0, f1: 0, avgConfidence: 0, totalWindows: 0 };

  const accuracy = (totalCorrect / totalPreds) * 100;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const avgConfidence = totalConf / totalPreds * 100;

  return {
    accuracy: parseFloat(accuracy.toFixed(1)),
    precision: parseFloat(precision.toFixed(3)),
    recall: parseFloat(recall.toFixed(3)),
    f1: parseFloat(f1.toFixed(3)),
    avgConfidence: parseFloat(avgConfidence.toFixed(1)),
    totalWindows: nWindows,
  };
}

// === Label Generation ===
export function generateLabels(candles: OHLC[], forwardDays: number): number[] {
  const labels: number[] = [];
  for (let i = 60; i < candles.length - forwardDays; i++) {
    const futureClose = candles[i + forwardDays].close;
    const currentClose = candles[i].close;
    labels.push(futureClose > currentClose ? 1 : 0);
  }
  return labels;
}

// === Model Interface ===
export interface MLModel {
  ticker: string;
  weights: number[];
  mean: number[];
  std: number[];
  plattA: number;
  plattB: number;
  forwardDays: number;
  trainedAt: number;
  accuracy: number;
  totalSamples: number;
}

const MODEL_STORAGE_KEY = 'opencode_ml_models';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadModels(): Record<string, MLModel> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveModels(models: Record<string, MLModel>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(models));
  } catch { /* ignore */ }
}

export function getModel(ticker: string): MLModel | null {
  return loadModels()[ticker] || null;
}

export function computeModelParams(
  ticker: string,
  candles: OHLC[],
  forwardDays = 5,
): { model: Omit<MLModel, 'trainedAt'>; n: number } | null {
  if (candles.length < 80) return null;

  const features = extractFeatures(candles);
  if (features.length < 40) return null;

  const labels = generateLabels(candles, forwardDays);
  if (labels.length < 40) return null;

  const n = Math.min(features.length, labels.length);
  const trainFeatures = features.slice(0, n);
  const trainLabels = labels.slice(0, n);

  const { mean, std } = computeStats(trainFeatures);
  const trainStd = standardize(trainFeatures, mean, std);

  const weights = fitLogisticRegression(trainStd, trainLabels);

  const rawScores: number[] = [];
  for (const f of trainStd) {
    const z = f.reduce((s, v, j) => s + v * weights[j], 0);
    rawScores.push(z);
  }
  const { a, b } = plattCalibrate(rawScores, trainLabels);

  const wfResult = walkForwardValidation(trainFeatures, trainLabels);

  return {
    model: {
      ticker,
      weights,
      mean,
      std,
      plattA: a,
      plattB: b,
      forwardDays,
      accuracy: wfResult.accuracy,
      totalSamples: n,
    },
    n,
  };
}

export function trainModel(
  ticker: string,
  candles: OHLC[],
  forwardDays = 5,
): MLModel | null {
  const result = computeModelParams(ticker, candles, forwardDays);
  if (!result) return null;

  const model: MLModel = { ...result.model, trainedAt: Date.now() };

  const models = loadModels();
  models[ticker] = model;
  saveModels(models);

  return model;
}

// === Prediction with ML ===
export interface MLPredictionResult {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  probability: number;
  confidence: number;
  rawScore: number;
  calibratedProb: number;
  modelAccuracy: number;
  modelSamples: number;
}

export function predictWithModel(
  model: MLModel,
  candles: OHLC[],
  activeSentimentBoost = 0, // Injected from Corporate Announcements AI
): MLPredictionResult | null {
  // Get the last window of candles to extract features
  const features = extractFeatures(candles);
  if (features.length === 0) return null;

  const lastFeatures = features[features.length - 1];
  const expectedDim = Math.min(model.mean.length, model.std.length, model.weights.length);
  if (lastFeatures.length !== expectedDim) return null;
  const lastStd = lastFeatures.map((v, j) => (v - model.mean[j]) / model.std[j]);

  // Raw score (logit)
  const rawScore = lastStd.reduce((s, v, j) => s + v * model.weights[j], 0);

  // Calibrated probability via Platt scaling
  let probability = calibrateProbability(rawScore, model.plattA, model.plattB);

  // === FUSE AI SENTIMENT ===
  // activeSentimentBoost is typically -100 to +100. We map this to a probability shift.
  if (activeSentimentBoost !== 0) {
    const shift = (activeSentimentBoost / 100) * 0.35; // Max 35% probability shift from news
    probability = Math.max(0.01, Math.min(0.99, probability + shift));
  }

  // Direction and confidence
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    probability > 0.6 ? 'BULLISH' :
    probability < 0.4 ? 'BEARISH' : 'NEUTRAL';

  // Confidence: distance from 0.5 scaled to 0-65 (realistic cap)
  const confidence = clampConfidence(Math.round(Math.max(probability, 1 - probability) * 100));

  return {
    direction,
    probability: parseFloat((probability * 100).toFixed(1)),
    confidence,
    rawScore: parseFloat(rawScore.toFixed(4)),
    calibratedProb: parseFloat(probability.toFixed(4)),
    modelAccuracy: model.accuracy,
    modelSamples: model.totalSamples,
  };
}

// === Gradient Boosted Decision Tree (GBDT) — ensemble of shallow trees ===
export interface GBDTTree {
  threshold: number;
  featureIdx: number;
  left: number;
  right: number;
  leafValue: number;
  depth: number;
  leftTree?: GBDTTree;
  rightTree?: GBDTTree;
}

export interface GBDTModel {
  trees: GBDTTree[];
  learningRate: number;
  nEstimators: number;
  maxDepth: number;
}

export function trainGBDT(
  features: number[][],
  labels: number[],
  nEstimators = 40,
  learningRate = 0.1,
  maxDepth = 3,
): GBDTModel {
  const n = features.length;
  const dim = features[0].length;
  const trees: GBDTTree[] = [];
  const residuals = labels.map(y => y); // start with raw labels

  for (let t = 0; t < nEstimators; t++) {
    const tree = buildStump(features, residuals, dim, maxDepth, 0);
    trees.push(tree);
    // Update residuals: subtract the prediction from current residual
    for (let i = 0; i < n; i++) {
      const pred = predictTree(tree, features[i]);
      residuals[i] -= learningRate * pred;
    }
  }

  return { trees, learningRate, nEstimators, maxDepth };
}

function buildStump(
  features: number[][],
  residuals: number[],
  dim: number,
  maxDepth: number,
  depth: number,
): GBDTTree {
  const n = features.length;
  if (depth >= maxDepth || n < 4) {
    return { threshold: 0, featureIdx: 0, left: 0, right: 0, leafValue: avg(residuals), depth };
  }

  let bestFeature = 0;
  let bestThreshold = 0;
  let bestGain = -Infinity;

  // Find best split
  for (let f = 0; f < Math.min(dim, 6); f++) {
    // Sample threshold candidates from feature values
    const sorted = features.map((row, i) => ({ val: row[f], res: residuals[i] }))
      .sort((a, b) => a.val - b.val);
    for (let s = 1; s < Math.min(sorted.length, 20); s++) {
      const threshold = sorted[s].val;
      let leftSum = 0, leftCount = 0, rightSum = 0, rightCount = 0;
      for (const item of sorted) {
        if (item.val <= threshold) { leftSum += item.res; leftCount++; }
        else { rightSum += item.res; rightCount++; }
      }
      if (leftCount < 2 || rightCount < 2) continue;
      const leftMean = leftSum / leftCount;
      const rightMean = rightSum / rightCount;
      let gain = 0;
      for (const item of sorted) {
        const mean = item.val <= threshold ? leftMean : rightMean;
        gain -= (item.res - mean) ** 2;
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  if (bestGain === -Infinity) {
    return { threshold: 0, featureIdx: 0, left: 0, right: 0, leafValue: avg(residuals), depth };
  }

  const leftFeatures: number[][] = [];
  const leftResiduals: number[] = [];
  const rightFeatures: number[][] = [];
  const rightResiduals: number[] = [];

  for (let i = 0; i < n; i++) {
    if (features[i][bestFeature] <= bestThreshold) {
      leftFeatures.push(features[i]);
      leftResiduals.push(residuals[i]);
    } else {
      rightFeatures.push(features[i]);
      rightResiduals.push(residuals[i]);
    }
  }

  const leftTree = buildStump(leftFeatures, leftResiduals, dim, maxDepth, depth + 1);
  const rightTree = buildStump(rightFeatures, rightResiduals, dim, maxDepth, depth + 1);

  return {
    threshold: bestThreshold,
    featureIdx: bestFeature,
    left: leftTree.leafValue !== undefined ? leftTree.leafValue : 0,
    right: rightTree.leafValue !== undefined ? rightTree.leafValue : 0,
    leafValue: 0,
    depth,
    leftTree,
    rightTree,
  };
}

function predictTree(tree: GBDTTree, features: number[]): number {
  if (tree.leafValue !== 0 || (!tree.leftTree && !tree.rightTree)) {
    return tree.leafValue;
  }
  if (features[tree.featureIdx] <= tree.threshold) {
    return tree.leftTree ? predictTree(tree.leftTree, features) : tree.left;
  }
  return tree.rightTree ? predictTree(tree.rightTree, features) : tree.right;
}

export function predictGBDT(model: GBDTModel, features: number[]): number {
  let score = 0;
  for (const tree of model.trees) {
    score += model.learningRate * predictTree(tree, features);
  }
  return sigmoid(score);
}

// === Online / Incremental Learning ===
export function onlineUpdateWeights(
  weights: number[],
  features: number[],
  label: number,
  learningRate = 0.05,
  l2 = 0.01,
): number[] {
  const z = features.reduce((s, v, j) => s + v * weights[j], 0);
  const pred = sigmoid(z);
  const error = pred - label;
  const updated = weights.map((w, j) => w - learningRate * (error * features[j] + l2 * w));
  return updated;
}

export function onlineUpdatePlatt(
  a: number,
  b: number,
  rawScore: number,
  label: number,
  lr = 0.01,
): { a: number; b: number } {
  const z = a * rawScore + b;
  const p = sigmoid(z);
  const gradA = rawScore * (p - label);
  const gradB = (p - label);
  return {
    a: a - lr * gradA,
    b: b - lr * gradB,
  };
}

// === Multi-Ticker Ensemble (averaged predictions across correlated tickers) ===
export function multiTickerEnsemble(
  models: { ticker: string; prediction: MLPredictionResult }[],
): MLPredictionResult {
  if (models.length === 0) return { direction: 'NEUTRAL', probability: 50, confidence: 0, rawScore: 0, calibratedProb: 0.5, modelAccuracy: 0, modelSamples: 0 };

  const bullishCount = models.filter(m => m.prediction.direction === 'BULLISH').length;
  const bearishCount = models.filter(m => m.prediction.direction === 'BEARISH').length;
  const avgProb = models.reduce((s, m) => s + m.prediction.probability, 0) / models.length;
  const avgConf = models.reduce((s, m) => s + m.prediction.confidence, 0) / models.length;
  const avgAcc = models.reduce((s, m) => s + m.prediction.modelAccuracy, 0) / models.length;
  const totalSamples = models.reduce((s, m) => s + m.prediction.modelSamples, 0);

  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  if (bullishCount > bearishCount && bullishCount > models.length * 0.4) direction = 'BULLISH';
  else if (bearishCount > bullishCount && bearishCount > models.length * 0.4) direction = 'BEARISH';
  else direction = 'NEUTRAL';

  const confidence = clampConfidence(Math.round(avgConf));

  return {
    direction,
    probability: parseFloat(avgProb.toFixed(1)),
    confidence,
    rawScore: 0,
    calibratedProb: avgProb / 100,
    modelAccuracy: parseFloat(avgAcc.toFixed(1)),
    modelSamples: totalSamples,
  };
}

// === Regime-Adaptive Prediction ===
// Must be kept in sync with technicalAnalysis.ts:MarketRegime
export type RegimeType = 'STRONG_TREND' | 'WEAK_TREND' | 'RANGING' | 'HIGH_VOLATILITY' | 'PANIC' | 'BREAKOUT';

export function predictWithRegimeAdaptation(
  model: MLModel,
  candles: OHLC[],
  regime: RegimeType,
): MLPredictionResult | null {
  const base = predictWithModel(model, candles);
  if (!base) return null;

  // Adjust confidence based on regime
  let regimeMultiplier = 1;
  let confidenceAdjustment = 0;

  switch (regime) {
    case 'STRONG_TREND':
      // Models perform better in trending markets
      regimeMultiplier = 1.1;
      confidenceAdjustment = 5;
      break;
    case 'WEAK_TREND':
      regimeMultiplier = 1.0;
      break;
    case 'RANGING':
      regimeMultiplier = 0.92;
      confidenceAdjustment = -5;
      break;
    case 'HIGH_VOLATILITY':
      regimeMultiplier = 0.82;
      confidenceAdjustment = -10;
      break;
    case 'PANIC':
      regimeMultiplier = 0.72;
      confidenceAdjustment = -15;
      break;
    case 'BREAKOUT':
      // Breakouts can be strong but model may not capture them well
      regimeMultiplier = 0.85;
      confidenceAdjustment = -5;
      break;
  }

  const adjustedConfidence = clampConfidence(Math.round(base.confidence * regimeMultiplier) + confidenceAdjustment);

  return {
    ...base,
    confidence: adjustedConfidence,
  };
}
