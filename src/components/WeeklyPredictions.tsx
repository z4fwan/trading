'use client';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useMarketData, type QuoteData } from '@/lib/MarketDataContext';
import { calculateIndicators, generatePrediction, buildCandleHistory, type PredictionScore } from '@/lib/technicalAnalysis';
import { addPredictions, getExpiryDate } from '@/lib/predictionStore';
import { ALL_TICKERS, INTERNATIONAL_TICKERS, getTickerName } from '@/lib/marketConfig';
import { tickerCurrency } from '@/components/LiveTickerPrice';
import { getAggregatedSentiment } from '@/lib/newsStore';

interface DayPrediction {
  date: string; day: string; time: string; ticker: string; name: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; entry: number; target: number; stopLoss: number;
  confidence: number; catalyst: string; reasoning: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMES = ['09:15 AM', '10:30 AM', '01:15 PM', '09:30 AM', '11:00 AM', '02:00 PM', '09:00 AM', '12:00 PM', '03:30 PM', '10:45 AM', '01:30 PM', '03:00 PM', '10:00 AM', '11:30 AM', '06:00 PM', '08:00 PM'];

const PREDICTION_TICKERS = ALL_TICKERS.filter(t => !INTERNATIONAL_TICKERS.includes(t) || ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','JPM','V'].includes(t)).slice(0, 28);

function getNextWeekDates(): { date: string; day: string }[] {
  const result: { date: string; day: string }[] = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7;

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilNextMonday + i);
    result.push({
      day: DAY_NAMES[d.getDay()],
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    });
  }
  return result;
}

function generateReasoning(score: PredictionScore): { catalyst: string; reasoning: string } {
  const reasons = score.reasoning;
  const keyFactors = reasons.slice(0, 3).join('. ');
  const dir = score.direction;
  const signalType = score.confidence >= 60 ? 'strong' : score.confidence >= 45 ? 'moderate' : 'cautious';
  const trendDesc = score.trendStrength > 30 ? 'with strong trend confirmation' : 'with developing momentum';
  const volNote = score.volatilityRisk > 25 ? 'Increased volatility — position sizing advisable.' : 'Volatility within normal range.';
  const catalyst = `${dir} setup — ${score.regime} regime, ${score.trendStrength.toFixed(0)} trend strength`;
  const reasoning = `TA-based ${signalType} ${dir.toLowerCase()} signal ${trendDesc}. ${keyFactors}. ${volNote} Risk level: ${score.riskLevel}.`;
  return { catalyst, reasoning };
}

export default function WeeklyPredictions() {
  const { stocks, connectionStatus, getHistory, getSessionHL } = useMarketData();
  const weekDates = getNextWeekDates();
  const [allPredictions, setAllPredictions] = useState<Record<string, PredictionScore>>({});
  const lastComputeRef = useRef(0);
  const lastWeeklyHashRef = useRef('');

  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;

  // Generate real TA-driven predictions for all tickers, throttled to 60s
  useEffect(() => {
    const now = Date.now();
    if (now - lastComputeRef.current < 60000) return;
    lastComputeRef.current = now;

    const priceMap = stocks as Record<string, QuoteData>;
    const hasRealPrices = Object.values(priceMap).some(s => s?.price > 0);
    if (!hasRealPrices) return;

    const newPreds: Record<string, PredictionScore> = {};

    for (const ticker of PREDICTION_TICKERS) {
      const current = priceMap[ticker];
      if (!current || current.price <= 0) continue;
      const hist = getHistoryRef.current(ticker);
      if (!hist || hist.length < 30) continue;
      const hl = getSessionHL(ticker);
      const candles = buildCandleHistory(hist, current.price, current.volume, current.prevClose, hl?.high, hl?.low);
      if (candles.length < 30) continue;
      const ta = calculateIndicators(candles);
      if (!ta) continue;
      const pred = generatePrediction(ticker, current.price, ta);
      newPreds[ticker] = pred;
    }
    queueMicrotask(() => { setAllPredictions(newPreds); });
  }, [stocks]);

  const predictionPools = useMemo((): { [day: string]: DayPrediction[] } => {
    const pools: { [day: string]: DayPrediction[] } = {};
    const entries = Object.entries(allPredictions)
      .filter(([, p]) => p.direction !== 'NEUTRAL' && p.confidence >= 35)
      .sort((a, b) => b[1].confidence - a[1].confidence);

    let timeIdx = 0;
    for (const [ticker, pred] of entries) {
      const tickerIdx = PREDICTION_TICKERS.indexOf(ticker);
      const slot = tickerIdx >= 0 ? tickerIdx % weekDates.length : 0;
      const wd = weekDates[slot] ?? weekDates[0];
      const day = wd.day;
      if (!pools[day]) pools[day] = [];
      const count = pools[day].length;
      if (count >= 4) continue;
      const stopLoss = pred.direction === 'BULLISH'
        ? parseFloat((pred.entryPrice * (1 - (pred.volatilityRisk / 100) * 0.5)).toFixed(2))
        : pred.direction === 'BEARISH'
        ? parseFloat((pred.entryPrice * (1 + (pred.volatilityRisk / 100) * 0.5)).toFixed(2))
        : parseFloat((pred.entryPrice * 0.98).toFixed(2));
      const { catalyst, reasoning } = generateReasoning(pred);
      pools[day].push({
        date: wd.date, day, time: TIMES[timeIdx % TIMES.length], ticker, name: getTickerName(ticker),
        direction: pred.direction, entry: pred.entryPrice, target: pred.targetPrice, stopLoss,
        confidence: pred.confidence, catalyst, reasoning,
      });
      timeIdx++;
    }
    return pools;
  }, [allPredictions, weekDates]);

  // Record predictions to trust store — throttled with hash dedup
  useEffect(() => {
    const allPreds = Object.values(predictionPools).flat();
    const now = new Date().toISOString().split('T')[0];
    let hash = '';
    for (const p of allPreds) hash += `${p.ticker}|${p.entry.toFixed(2)}|${p.target.toFixed(2)}|${p.confidence},`;
    if (hash === lastWeeklyHashRef.current) return;
    lastWeeklyHashRef.current = hash;
    const { overall: sentimentOverall } = getAggregatedSentiment(72);
    addPredictions(allPreds.map(p => ({
      ticker: p.ticker, name: p.name, source: 'WEEKLY_PREDICTIONS' as const,
      predictionType: 'WEEKLY' as const, direction: p.direction,
      bullishProb: p.direction === 'BULLISH' ? 70 : p.direction === 'BEARISH' ? 30 : 50,
      bearishProb: p.direction === 'BEARISH' ? 70 : p.direction === 'BULLISH' ? 30 : 50,
      confidence: p.confidence, entryPrice: p.entry, targetPrice: p.target,
      stopLoss: p.stopLoss, expectedVolatility: 35, marketCondition: '',
      regime: '', sentimentScore: sentimentOverall ?? 50, taSnapshot: null,
      reasoning: [p.catalyst, p.reasoning],
      targetDate: now, expiryDate: getExpiryDate('WEEKLY'),
    })));
  }, [predictionPools]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight">AI Weekly Prediction Engine</h2>
          <p className="text-[9px] text-slate-500 font-mono">Next-week forecasts — Entry, Target, Stop Loss, Reasoning {connectionStatus === 'disconnected' ? '⚠️ No connection — data frozen' : ''}</p>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-slate-600 font-mono">
          <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
          Week of {weekDates[0]?.date} — {weekDates[6]?.date}
        </div>
      </div>

      {Object.keys(allPredictions).length === 0 && connectionStatus !== 'disconnected' && (
        <div className="text-center py-12 text-slate-500 font-mono text-xs animate-pulse">
          Loading weekly predictions — fetching price history…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {weekDates.map(wd => {
          const predictions = predictionPools[wd.day as keyof typeof predictionPools] || [];
          if (predictions.length === 0) return null;

          return (
            <div key={wd.day} className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5 backdrop-blur-sm hover:border-slate-700/60 transition-all duration-500">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full animate-pulse-glow ${
                    wd.day === 'Saturday' || wd.day === 'Sunday' ? 'bg-yellow-500' : 'bg-emerald-500'
                  }`} />
                  <span className="text-sm font-bold text-white font-mono">{wd.day}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{wd.date}</span>
                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full border ${
                    wd.day === 'Saturday' || wd.day === 'Sunday'
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {wd.day === 'Saturday' || wd.day === 'Sunday' ? 'WEEKEND' : 'TRADING DAY'}
                  </span>
                </div>
                <span className="text-[9px] text-slate-600 font-mono">{predictions.length} predictions</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {predictions.map((pred, i) => {
                  const pctToTarget = ((pred.target - pred.entry) / pred.entry * 100);
                  return (
                  <div key={i} className={`p-4 rounded-xl border transition-all duration-300 hover:shadow-lg ${
                    pred.direction === 'BULLISH' ? 'border-emerald-900/40 bg-emerald-950/10 hover:border-emerald-700/60' :
                    pred.direction === 'BEARISH' ? 'border-red-900/40 bg-red-950/10 hover:border-red-700/60' :
                    'border-slate-700/40 bg-slate-950/20 hover:border-slate-600/60'
                  }`}>
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-white">{pred.ticker}</span>
                        {stocks[pred.ticker]?.price && <span className="text-[7px] text-emerald-500 font-mono bg-emerald-950/30 px-1 rounded border border-emerald-900/50">REAL</span>}
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          pred.direction === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          pred.direction === 'BEARISH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                        }`}>
                          {pred.direction === 'BULLISH' ? '📈 BULLISH' : pred.direction === 'BEARISH' ? '📉 BEARISH' : '⚖️ NEUTRAL'}
                        </span>
                        <span className="text-[8px] text-emerald-400 font-mono bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800">⏰ {pred.time}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">{pred.name}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                        <div className="text-[7px] text-slate-500 uppercase font-mono">Entry</div>
                        <div className="text-[11px] font-mono font-bold text-white">{tickerCurrency(pred.ticker)}{pred.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                        <div className="text-[7px] text-slate-500 uppercase font-mono">Target {pctToTarget >= 0 ? `+${pctToTarget.toFixed(1)}%` : `${pctToTarget.toFixed(1)}%`}</div>
                        <div className={`text-[11px] font-mono font-bold ${pred.direction === 'BULLISH' || pred.direction === 'NEUTRAL' ? 'text-emerald-400' : 'text-red-400'}`}>{tickerCurrency(pred.ticker)}{pred.target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                        <div className="text-[7px] text-slate-500 uppercase font-mono">Stop Loss</div>
                        <div className={`text-[11px] font-mono font-bold ${pred.direction === 'BULLISH' || pred.direction === 'NEUTRAL' ? 'text-red-400' : 'text-emerald-400'}`}>{tickerCurrency(pred.ticker)}{pred.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>

                    <div className="bg-slate-950/40 rounded-lg p-3 mb-2 border-l-2 border-emerald-500/40">
                      <div className="flex items-start gap-2">
                        <span className="text-[8px] text-yellow-400 font-mono shrink-0 mt-0.5">⚡</span>
                        <span className="text-[9px] text-slate-300">{pred.catalyst}</span>
                      </div>
                      <div className="flex items-start gap-2 mt-1.5">
                        <span className="text-[8px] text-emerald-400 font-mono shrink-0 mt-0.5">🧠</span>
                        <span className="text-[9px] text-slate-400">{pred.reasoning}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[8px] mb-1">
                          <span className="text-slate-500 font-mono">AI Confidence</span>
                          <span className="font-mono font-bold text-white">{pred.confidence}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" style={{ width: `${pred.confidence}%` }} />
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-[8px] font-mono font-bold ${
                        pred.direction === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        pred.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        R:R {(pred.stopLoss !== pred.entry ? Math.abs((pred.target - pred.entry) / (pred.entry - pred.stopLoss)) : 0).toFixed(1)}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
