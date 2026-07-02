export interface OHLC { open: number; high: number; low: number; close: number; volume: number; }

export interface CandlePattern {
  name: string;
  type: 'SINGLE' | 'DOUBLE' | 'TRIPLE';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  description: string;
}

function bodySize(c: OHLC): number { return Math.abs(c.close - c.open); }
function upperWick(c: OHLC): number { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: OHLC): number { return Math.min(c.open, c.close) - c.low; }
function isBullish(c: OHLC): boolean { return c.close >= c.open; }
function isBearish(c: OHLC): boolean { return c.close < c.open; }
function avgBody(candles: OHLC[], n: number): number {
  const slice = candles.slice(-n);
  return slice.reduce((s, c) => s + bodySize(c), 0) / slice.length;
}

export function detectPatterns(candles: OHLC[], lookback = 30): CandlePattern[] {
  if (candles.length < 3) return [];
  const patterns: CandlePattern[] = [];
  const last = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : null;
  const prev2 = candles.length >= 3 ? candles[candles.length - 3] : null;

  const avg = avgBody(candles, lookback);
  const lastBody = bodySize(last);
  const lastUpper = upperWick(last);
  const lastLower = lowerWick(last);

  // === SINGLE CANDLE PATTERNS ===

  // Doji: open ≈ close (body very small)
  if (lastBody < avg * 0.1 && lastBody > 0) {
    if (lastUpper > lastBody * 3 && lastLower > lastBody * 3) {
      patterns.push({ name: 'Long-Legged Doji', type: 'SINGLE', direction: 'NEUTRAL', confidence: 70, description: 'Indecision with wide range — potential reversal' });
    } else if (lastLower > lastBody * 3 && lastUpper < lastBody) {
      patterns.push({ name: 'Dragonfly Doji', type: 'SINGLE', direction: 'BULLISH', confidence: 75, description: 'Long lower wick — bullish reversal signal at support' });
    } else if (lastUpper > lastBody * 3 && lastLower < lastBody) {
      patterns.push({ name: 'Gravestone Doji', type: 'SINGLE', direction: 'BEARISH', confidence: 75, description: 'Long upper wick at top — bearish reversal' });
    } else {
      patterns.push({ name: 'Doji', type: 'SINGLE', direction: 'NEUTRAL', confidence: 60, description: 'Opening and closing prices nearly equal — market indecision' });
    }
  }

  // Hammer: small body, long lower wick (2-3x body), little/no upper wick
  if (lastBody > avg * 0.1 && lastLower >= lastBody * 2 && lastUpper < lastBody * 0.3) {
    const dir = isBullish(last) ? 'BULLISH' as const : 'BEARISH' as const;
    const conf = lastLower >= lastBody * 3 ? 78 : 68;
    patterns.push({ name: 'Hammer', type: 'SINGLE', direction: dir, confidence: conf, description: `${dir} hammer — long lower wick suggests rejection of lows` });
  }

  // Shooting Star: small body, long upper wick, little/no lower wick
  if (lastBody > avg * 0.1 && lastUpper >= lastBody * 2 && lastLower < lastBody * 0.3) {
    const dir = isBearish(last) ? 'BEARISH' as const : 'NEUTRAL' as const;
    patterns.push({ name: 'Shooting Star', type: 'SINGLE', direction: dir, confidence: 72, description: `${dir} shooting star — rejection at highs, potential reversal down` });
  }

  // Marubozu: no wicks, strong body
  if (lastUpper < lastBody * 0.05 && lastLower < lastBody * 0.05 && lastBody > avg * 1.5) {
    const dir = isBullish(last) ? 'BULLISH' as const : 'BEARISH' as const;
    patterns.push({ name: 'Marubozu', type: 'SINGLE', direction: dir, confidence: 80, description: `Strong ${dir.toLowerCase()} momentum — no wicks, full-bodied candle` });
  }

  // Spinning Top: small body, wicks on both sides
  if (lastBody < avg * 0.7 && lastBody > avg * 0.1 && lastUpper > lastBody * 0.5 && lastLower > lastBody * 0.5) {
    patterns.push({ name: 'Spinning Top', type: 'SINGLE', direction: 'NEUTRAL', confidence: 55, description: 'Small body with upper and lower wicks — consolidation, indecision' });
  }

  if (!prev) return patterns;

  // === DOUBLE CANDLE PATTERNS ===
  const prevBody = bodySize(prev);

  // Bullish Engulfing
  if (isBearish(prev) && isBullish(last) && last.close > prev.open && last.open < prev.close && lastBody > prevBody * 1.2) {
    patterns.push({ name: 'Bullish Engulfing', type: 'DOUBLE', direction: 'BULLISH', confidence: 82, description: 'Bullish candle fully engulfs previous bearish candle — strong reversal signal' });
  }

  // Bearish Engulfing
  if (isBullish(prev) && isBearish(last) && last.close < prev.open && last.open > prev.close && lastBody > prevBody * 1.2) {
    patterns.push({ name: 'Bearish Engulfing', type: 'DOUBLE', direction: 'BEARISH', confidence: 82, description: 'Bearish candle fully engulfs previous bullish candle — strong reversal down' });
  }

  // Harami Bullish: small bullish candle inside previous bearish
  if (isBearish(prev) && isBullish(last) && last.high < prev.open && last.low > prev.close && lastBody < prevBody * 0.6) {
    patterns.push({ name: 'Bullish Harami', type: 'DOUBLE', direction: 'BULLISH', confidence: 65, description: 'Small bullish candle inside previous bearish — potential trend reversal' });
  }

  // Harami Bearish: small bearish candle inside previous bullish
  if (isBullish(prev) && isBearish(last) && last.high < prev.high && last.low > prev.low && lastBody < prevBody * 0.6) {
    patterns.push({ name: 'Bearish Harami', type: 'DOUBLE', direction: 'BEARISH', confidence: 65, description: 'Small bearish candle inside previous bullish — potential reversal down' });
  }

  // Piercing Pattern: bearish then bullish that closes above 50% of prev body
  if (isBearish(prev) && isBullish(last) && last.open < prev.close && last.close > (prev.open + prev.close) / 2) {
    patterns.push({ name: 'Piercing Pattern', type: 'DOUBLE', direction: 'BULLISH', confidence: 75, description: 'Bullish candle closes above midpoint of previous bearish candle — bullish reversal' });
  }

  // Dark Cloud Cover: bullish then bearish that closes below 50% of prev body
  if (isBullish(prev) && isBearish(last) && last.open > prev.close && last.close < (prev.open + prev.close) / 2) {
    patterns.push({ name: 'Dark Cloud Cover', type: 'DOUBLE', direction: 'BEARISH', confidence: 75, description: 'Bearish candle closes below midpoint of previous bullish candle — bearish reversal' });
  }

  // Tweezer Top: two candles with same high (resistance)
  if (Math.abs(prev.high - last.high) / prev.high < 0.001 && isBullish(prev) && isBearish(last)) {
    patterns.push({ name: 'Tweezer Top', type: 'DOUBLE', direction: 'BEARISH', confidence: 70, description: 'Same high on two consecutive candles — double top resistance rejection' });
  }

  // Tweezer Bottom: two candles with same low (support)
  if (Math.abs(prev.low - last.low) / prev.low < 0.001 && isBearish(prev) && isBullish(last)) {
    patterns.push({ name: 'Tweezer Bottom', type: 'DOUBLE', direction: 'BULLISH', confidence: 70, description: 'Same low on two consecutive candles — double bottom support bounce' });
  }

  if (!prev2) return patterns;

  // === TRIPLE CANDLE PATTERNS ===
  const prev2Body = bodySize(prev2);

  // Morning Star: bearish, small-bodied (doji-like), bullish that closes above midpoint of first
  if (isBearish(prev2) && prev2Body > avg * 0.8 && bodySize(prev) < avg * 0.4 && isBullish(last) && last.close > (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Morning Star', type: 'TRIPLE', direction: 'BULLISH', confidence: 88, description: 'Bearish → indecision → strong bullish — classic bullish reversal pattern' });
  }

  // Evening Star: bullish, small-bodied (doji-like), bearish that closes below midpoint of first
  if (isBullish(prev2) && prev2Body > avg * 0.8 && bodySize(prev) < avg * 0.4 && isBearish(last) && last.close < (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Evening Star', type: 'TRIPLE', direction: 'BEARISH', confidence: 88, description: 'Bullish → indecision → strong bearish — classic bearish reversal pattern' });
  }

  // Three White Soldiers: three consecutive strong bullish candles
  if (isBullish(prev2) && isBullish(prev) && isBullish(last) &&
      prev2Body > avg * 0.8 && prevBody > avg * 0.8 && lastBody > avg * 0.8 &&
      prev.close > prev2.close && last.close > prev.close) {
    patterns.push({ name: 'Three White Soldiers', type: 'TRIPLE', direction: 'BULLISH', confidence: 85, description: 'Three consecutive strong bullish candles — sustained upward momentum' });
  }

  // Three Black Crows: three consecutive strong bearish candles
  if (isBearish(prev2) && isBearish(prev) && isBearish(last) &&
      prev2Body > avg * 0.8 && prevBody > avg * 0.8 && lastBody > avg * 0.8 &&
      prev.close < prev2.close && last.close < prev.close) {
    patterns.push({ name: 'Three Black Crows', type: 'TRIPLE', direction: 'BEARISH', confidence: 85, description: 'Three consecutive strong bearish candles — sustained downward momentum' });
  }

  // Three Inside Up: bearish harami → bullish breakout
  if (isBearish(prev2) && isBullish(prev) && prev.high < prev2.open && prev.low > prev2.close && isBullish(last) && last.close > prev2.open) {
    patterns.push({ name: 'Three Inside Up', type: 'TRIPLE', direction: 'BULLISH', confidence: 78, description: 'Bearish → harami → breakout above first candle — bullish reversal' });
  }

  // Three Inside Down: bullish harami → bearish breakdown
  if (isBullish(prev2) && isBearish(prev) && prev.high < prev2.high && prev.low > prev2.low && isBearish(last) && last.close < prev2.low) {
    patterns.push({ name: 'Three Inside Down', type: 'TRIPLE', direction: 'BEARISH', confidence: 78, description: 'Bullish → harami → breakdown below first candle — bearish reversal' });
  }

  return patterns;
}

export interface PatternSignal {
  ticker: string;
  patterns: CandlePattern[];
  netDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  netConfidence: number;
  primaryPattern: CandlePattern | null;
  summary: string;
}

export function generatePatternSignal(ticker: string, candles: OHLC[]): PatternSignal {
  const patterns = detectPatterns(candles);
  if (patterns.length === 0) {
    return { ticker, patterns, netDirection: 'NEUTRAL', netConfidence: 0, primaryPattern: null, summary: 'No significant candlestick patterns detected' };
  }

  let bullishScore = 0, bearishScore = 0;
  for (const p of patterns) {
    if (p.direction === 'BULLISH') bullishScore += p.confidence;
    else if (p.direction === 'BEARISH') bearishScore += p.confidence;
  }

  const total = bullishScore + bearishScore || 1;
  const netDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = bullishScore > bearishScore + 20 ? 'BULLISH' : bearishScore > bullishScore + 20 ? 'BEARISH' : 'NEUTRAL';
  const netConfidence = Math.min(95, Math.round(Math.max(bullishScore, bearishScore) / total * 100));

  const highestConf = [...patterns].sort((a, b) => b.confidence - a.confidence);
  const primaryPattern = highestConf[0];

  const topPatterns = patterns.slice(0, 2).map(p => `${p.name} (${p.direction}, ${p.confidence}%)`).join(' + ');

  return {
    ticker, patterns, netDirection, netConfidence, primaryPattern,
    summary: topPatterns ? `Pattern: ${topPatterns} — ${netDirection} bias at ${netConfidence}%` : 'No significant patterns',
  };
}
