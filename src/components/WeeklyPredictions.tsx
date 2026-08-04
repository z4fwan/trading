'use client';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useMarketData, type QuoteData } from '@/lib/MarketDataContext';
import { calculateIndicators, generatePrediction, buildCandleHistory, type PredictionScore } from '@/lib/technicalAnalysis';
import { addPredictions, getExpiryDate } from '@/lib/predictionStore';
import { NIFTY_50_TICKERS, getTickerName } from '@/lib/marketConfig';
import { getAggregatedSentiment } from '@/lib/newsStore';

interface LivePrediction {
  timestamp: string;
  ticker: string;
  name: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  catalyst: string;
  reasoning: string;
}

const PREDICTION_TICKERS = NIFTY_50_TICKERS.slice(0, 30); // Strictly Indian Market

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
  const { stocks, connectionStatus, getHistory, getSessionHL, fetchHistoryBatch } = useMarketData();
  const [allPredictions, setAllPredictions] = useState<Record<string, PredictionScore>>({});
  const lastComputeRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;

  useEffect(() => {
    fetchHistoryBatch(PREDICTION_TICKERS);
  }, [fetchHistoryBatch]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastComputeRef.current < 30000) return; // Recompute every 30s
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

  const categorizedPredictions = useMemo(() => {
    const bullish: LivePrediction[] = [];
    const bearish: LivePrediction[] = [];
    const volatile: LivePrediction[] = [];
    
    const nowStamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    Object.entries(allPredictions).forEach(([ticker, pred]) => {
      if (pred.confidence < 35) return;
      const { catalyst, reasoning } = generateReasoning(pred);
      const stopLoss = pred.direction === 'BULLISH' ? pred.entryPrice * 0.95 : pred.direction === 'BEARISH' ? pred.entryPrice * 1.05 : pred.entryPrice;
      
      const p: LivePrediction = {
        timestamp: nowStamp,
        ticker,
        name: getTickerName(ticker),
        direction: pred.direction,
        entryPrice: pred.entryPrice,
        targetPrice: pred.targetPrice,
        stopLoss,
        confidence: pred.confidence,
        catalyst,
        reasoning
      };
      
      if (pred.volatilityRisk > 40) volatile.push(p);
      else if (pred.direction === 'BULLISH') bullish.push(p);
      else if (pred.direction === 'BEARISH') bearish.push(p);
    });

    return {
      bullish: bullish.sort((a, b) => b.confidence - a.confidence).slice(0, 3),
      bearish: bearish.sort((a, b) => b.confidence - a.confidence).slice(0, 3),
      volatile: volatile.sort((a, b) => b.confidence - a.confidence).slice(0, 3),
    };
  }, [allPredictions]);

  if (!mounted) return null;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-900/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              LIVE PREDICTIONS (NSE)
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Real-Time Machine Learning Projections</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">AI Confidence</div>
              <div className="text-sm font-bold text-indigo-400 font-mono">Live</div>
            </div>
          </div>
        </div>

        {Object.keys(allPredictions).length === 0 && connectionStatus !== 'disconnected' && (
          <div className="text-center py-12 text-slate-500 font-mono text-xs animate-pulse">
            Loading live predictions — analyzing market data…
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* BULLISH COLUMN */}
          <div className="flex flex-col relative group">
            <div className="bg-slate-950/60 border border-emerald-900/50 rounded-xl p-4 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/50">
                <h3 className="font-bold text-emerald-400 tracking-wide flex items-center gap-2"><span className="text-lg">🟢</span> Bullish Breakouts</h3>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                {categorizedPredictions.bullish.length === 0 ? (
                   <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest text-center py-8">Scanning...</div>
                ) : categorizedPredictions.bullish.map((p, i) => (
                  <PredictionCard key={i} p={p} />
                ))}
              </div>
            </div>
          </div>

          {/* BEARISH COLUMN */}
          <div className="flex flex-col relative group">
            <div className="bg-slate-950/60 border border-red-900/50 rounded-xl p-4 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/50">
                <h3 className="font-bold text-red-400 tracking-wide flex items-center gap-2"><span className="text-lg">🔴</span> Bearish Breakdowns</h3>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                {categorizedPredictions.bearish.length === 0 ? (
                   <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest text-center py-8">Scanning...</div>
                ) : categorizedPredictions.bearish.map((p, i) => (
                  <PredictionCard key={i} p={p} />
                ))}
              </div>
            </div>
          </div>

          {/* VOLATILE COLUMN */}
          <div className="flex flex-col relative group">
            <div className="bg-slate-950/60 border border-yellow-900/50 rounded-xl p-4 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/50">
                <h3 className="font-bold text-yellow-400 tracking-wide flex items-center gap-2"><span className="text-lg">⚡</span> High Volatility</h3>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                {categorizedPredictions.volatile.length === 0 ? (
                   <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest text-center py-8">Scanning...</div>
                ) : categorizedPredictions.volatile.map((p, i) => (
                  <PredictionCard key={i} p={p} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PredictionCard({ p }: { p: LivePrediction }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/40 relative overflow-hidden group/card hover:border-slate-700/50 transition-colors">
      <div className={`absolute top-0 right-0 w-16 h-16 blur-2xl rounded-full pointer-events-none transition-opacity opacity-0 group-hover/card:opacity-100 ${p.direction === 'BULLISH' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`} />
      
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">{p.ticker}</span>
            <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${p.direction === 'BULLISH' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' : 'bg-red-950/80 text-red-400 border border-red-900/50'}`}>{p.direction}</span>
          </div>
          <span className="text-[8px] text-slate-500 font-mono mt-0.5">{p.timestamp}</span>
        </div>
        <span className="text-[9px] font-mono text-indigo-400">{p.confidence}% conf</span>
      </div>
      
      <div className="flex items-center gap-3 text-[10px] font-mono mb-2 relative z-10">
        <div className="flex flex-col">
          <span className="text-slate-500 uppercase text-[7px] mb-0.5">Entry</span>
          <span className="text-slate-300">₹{p.entryPrice.toFixed(2)}</span>
        </div>
        <div className="h-4 w-px bg-slate-800"></div>
        <div className="flex flex-col">
          <span className="text-slate-500 uppercase text-[7px] mb-0.5">Target</span>
          <span className="text-emerald-400">₹{p.targetPrice.toFixed(2)}</span>
        </div>
        <div className="h-4 w-px bg-slate-800"></div>
        <div className="flex flex-col">
          <span className="text-slate-500 uppercase text-[7px] mb-0.5">Stop</span>
          <span className="text-red-400">₹{p.stopLoss.toFixed(2)}</span>
        </div>
      </div>

      <div className="text-[9px] text-slate-400 leading-relaxed border-l-2 border-slate-800 pl-2 mt-2 relative z-10">
        <span className="text-slate-500 uppercase text-[7px] block mb-0.5">Catalyst</span>
        {p.catalyst}
      </div>
    </div>
  );
}
