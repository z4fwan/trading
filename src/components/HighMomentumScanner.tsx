'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMarketData, type QuoteData } from '@/lib/MarketDataContext';
import { calculateIndicators, detectRegime, detectSmartMoney, buildCandleHistory, type OHLC, type TAIndicators } from '@/lib/technicalAnalysis';
import { INDIAN_EQUITY_TICKERS, NIFTY_50_TICKERS, getTickerName } from '@/lib/marketConfig';
import { getExchangeStatus } from '@/lib/exchangeHours';
import { getSupabase } from '@/lib/supabase';
import { fetchRealGlobalCues, type GlobalCuesData } from '@/lib/dataVerificationEngine';
import SmoothPrice from '@/components/SmoothPrice';

// === Momentum Score Calculation ===
interface MomentumStock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  momentumScore: number;
  momentumRank: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';
  ta: TAIndicators | null;
  smartMoney: { accumulation: number; distribution: number };
  preMarketGap: number;
  intradayHigh: number;
  intradayLow: number;
  intradayRange: number;
  isPreMarket: boolean;
  volatilityRisk: number;
  prediction: {
    direction: 'BULLISH' | 'BEARISH';
    confidence: number;
    expectedMove: number;
    reasoning: string[];
  };
}

interface ScannerConfig {
  minVolume: number;
  minChangePercent: number;
  minMomentumScore: number;
  showPreMarket: boolean;
  showLiveMomentum: boolean;
}

const DEFAULT_CONFIG: ScannerConfig = {
  minVolume: 50000,
  minChangePercent: 1.0,
  minMomentumScore: 50,
  showPreMarket: true,
  showLiveMomentum: true,
};

// Momentum score factors
function calculateMomentumScore(
  priceChange: number,
  volumeRatio: number,
  rsi: number,
  adx: number,
  macdHistogram: number,
  atrPercent: number,
  accumulation: number,
): number {
  let score = 50;

  // Price change contribution (0-25 points)
  const absChange = Math.abs(priceChange);
  if (absChange > 5) score += 25;
  else if (absChange > 3) score += 20;
  else if (absChange > 2) score += 15;
  else if (absChange > 1) score += 8;

  // Volume ratio contribution (0-20 points)
  if (volumeRatio > 3) score += 20;
  else if (volumeRatio > 2) score += 15;
  else if (volumeRatio > 1.5) score += 10;
  else if (volumeRatio > 1.2) score += 5;

  // RSI momentum (0-15 points)
  const rsiMomentum = Math.abs(rsi - 50);
  if (rsiMomentum > 30) score += 15;
  else if (rsiMomentum > 20) score += 10;
  else if (rsiMomentum > 10) score += 5;

  // ADX trend strength (0-15 points)
  if (adx > 40) score += 15;
  else if (adx > 30) score += 10;
  else if (adx > 20) score += 5;

  // MACD histogram momentum (0-10 points)
  const macdStrength = Math.abs(macdHistogram);
  if (macdStrength > 5) score += 10;
  else if (macdStrength > 2) score += 6;
  else if (macdStrength > 0.5) score += 3;

  // ATR volatility bonus (0-10 points) - higher volatility = more momentum potential
  if (atrPercent > 5) score += 10;
  else if (atrPercent > 3) score += 7;
  else if (atrPercent > 2) score += 4;

  // Smart money accumulation (0-5 points)
  if (accumulation > 70) score += 5;
  else if (accumulation > 60) score += 3;

  return Math.min(100, Math.max(0, score));
}

function getMomentumRank(score: number): MomentumStock['momentumRank'] {
  if (score >= 80) return 'VERY_HIGH';
  if (score >= 65) return 'HIGH';
  if (score >= 50) return 'MODERATE';
  return 'LOW';
}

function getMomentumColor(rank: MomentumStock['momentumRank']): string {
  switch (rank) {
    case 'VERY_HIGH': return 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/40 text-yellow-400';
    case 'HIGH': return 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 border-emerald-500/40 text-emerald-400';
    case 'MODERATE': return 'bg-blue-500/20 border-blue-500/40 text-blue-400';
    case 'LOW': return 'bg-slate-500/20 border-slate-500/40 text-slate-400';
  }
}

function getRankEmoji(rank: MomentumStock['momentumRank']): string {
  switch (rank) {
    case 'VERY_HIGH': return '🔥';
    case 'HIGH': return '⚡';
    case 'MODERATE': return '📊';
    case 'LOW': return '📉';
  }
}

// Pre-market prediction based on overnight factors
function generatePreMarketPrediction(
  ticker: string,
  prevClose: number,
  globalCues: { usClose: number | null; asianMarkets: number | null; giftNifty: number | null },
  sectorMomentum: number,
): { direction: 'BULLISH' | 'BEARISH'; confidence: number; expectedMove: number; reasoning: string[] } {
  const reasoning: string[] = [];
  let bullishScore = 50;

  // US market influence
  if (globalCues.usClose != null && globalCues.usClose > 1) {
    bullishScore += 10;
    reasoning.push(`US markets closed +${globalCues.usClose.toFixed(1)}% — positive spillover expected`);
  } else if (globalCues.usClose != null && globalCues.usClose < -1) {
    bullishScore -= 10;
    reasoning.push(`US markets closed ${globalCues.usClose.toFixed(1)}% — negative spillover expected`);
  }

  // Asian markets
  if (globalCues.asianMarkets != null && globalCues.asianMarkets > 0.5) {
    bullishScore += 8;
    reasoning.push('Asian markets trading positive — supportive sentiment');
  }

  // GIFT Nifty
  if (globalCues.giftNifty != null && globalCues.giftNifty > 0.3) {
    bullishScore += 12;
    reasoning.push(`GIFT Nifty indicates ${globalCues.giftNifty.toFixed(1)}% gap-up opening`);
  } else if (globalCues.giftNifty != null && globalCues.giftNifty < -0.3) {
    bullishScore -= 12;
    reasoning.push(`GIFT Nifty indicates ${globalCues.giftNifty.toFixed(1)}% gap-down opening`);
  }

  // Sector momentum
  if (sectorMomentum > 60) {
    bullishScore += 5;
    reasoning.push(`${ticker} sector showing strong momentum`);
  }

  const direction = bullishScore > 55 ? 'BULLISH' : bullishScore < 45 ? 'BEARISH' : 'BULLISH';
  const confidence = Math.abs(bullishScore - 50) * 2;
  const expectedMove = (globalCues.giftNifty != null ? Math.abs(globalCues.giftNifty) : 0) + (globalCues.usClose != null ? Math.abs(globalCues.usClose) * 0.3 : 0);

  return {
    direction,
    confidence: Math.min(85, Math.max(30, confidence)),
    expectedMove: parseFloat(expectedMove.toFixed(2)),
    reasoning,
  };
}

// Live momentum prediction
function generateLiveMomentumPrediction(
  ta: TAIndicators,
  priceChange: number,
  volumeRatio: number,
  accumulation: number,
): { direction: 'BULLISH' | 'BEARISH'; confidence: number; expectedMove: number; reasoning: string[] } {
  const reasoning: string[] = [];
  let bullishScore = 50;

  // Price momentum
  if (priceChange > 2) {
    bullishScore += 15;
    reasoning.push(`Strong price momentum (+${priceChange.toFixed(1)}%)`);
  } else if (priceChange > 1) {
    bullishScore += 8;
    reasoning.push(`Positive price momentum (+${priceChange.toFixed(1)}%)`);
  }

  // Volume confirmation
  if (volumeRatio > 2) {
    bullishScore += 12;
    reasoning.push(`Volume ${volumeRatio.toFixed(1)}x average — strong participation`);
  }

  // RSI — momentum scanner detects momentum, so high RSI = strong momentum
  if (ta.rsi > 60 && ta.rsi < 75) {
    bullishScore += 10;
    reasoning.push(`RSI at ${ta.rsi.toFixed(0)} — bullish momentum zone`);
  } else if (ta.rsi >= 75) {
    bullishScore += 10;
    reasoning.push(`RSI at ${ta.rsi.toFixed(0)} — very strong momentum`);
  }

  // MACD
  if (ta.macd.histogram > 0 && ta.macd.line > ta.macd.signal) {
    bullishScore += 10;
    reasoning.push('MACD bullish crossover confirmed');
  }

  // ADX
  if (ta.adx > 30) {
    bullishScore += 8;
    reasoning.push(`Strong trend (ADX ${ta.adx.toFixed(0)})`);
  }

  // Smart money
  if (accumulation > 65) {
    bullishScore += 8;
    reasoning.push('Smart money accumulation detected');
  }

  const direction = bullishScore > 55 ? 'BULLISH' : 'BEARISH';
  const confidence = Math.min(90, Math.max(30, Math.abs(bullishScore - 50) * 2 + 20));
  const expectedMove = ta.atr * 1.5 / ta.ema[20] * 100;

  return {
    direction,
    confidence: parseFloat(confidence.toFixed(0)),
    expectedMove: parseFloat(expectedMove.toFixed(2)),
    reasoning,
  };
}



export default function HighMomentumScanner() {
  const { getHistory, fetchHistoryBatch, getSessionHL, market, stocks } = useMarketData();
  const [momentumStocks, setMomentumStocks] = useState<MomentumStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [config, setConfig] = useState<ScannerConfig>(DEFAULT_CONFIG);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [globalCues, setGlobalCues] = useState<GlobalCuesData>({ usClose: 0, asianMarkets: 0, giftNifty: 0, vix: 15, timestamp: 0, usMarketStatus: 'LOADING', asianMarketStatus: 'LOADING', isLive: false });
  const [executedTrades, setExecutedTrades] = useState<Set<string>>(new Set());
  const [dynamicUniverse, setDynamicUniverse] = useState<string[]>([]);
  const lastScanRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Get current market status
  const marketStatus = useMemo(() => {
    const nseStatus = getExchangeStatus('NSE');
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // NSE trading hours: 9:15 AM to 3:30 PM
    const marketOpen = 9 * 60 + 15; // 9:15 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM
    const preMarketStart = 8 * 60 + 30; // 8:30 AM
    
    const isPreMarket = totalMinutes >= preMarketStart && totalMinutes < marketOpen;
    const isLive = totalMinutes >= marketOpen && totalMinutes <= marketClose;
    
    return {
      isPreMarket,
      isLive,
      isClosed: !isPreMarket && !isLive,
      nseStatus,
    };
  }, []);

  // Fetch recent announcements for pre-market cross-referencing
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => {
        if (data.news) {
          const mapped = data.news.map((item: any) => ({
            symbol: item.tickers?.[0] || 'MARKET',
            headline: item.headline,
            ensemble_signal: item.llmImpactLevel?.toLowerCase().includes('high') ? 'BUY' : 'NEUTRAL'
          }));
          setRecentAnnouncements(mapped);
        }
      })
      .catch(err => console.warn('Failed to fetch announcements for pre-market scanner:', err));
      
    // Fetch dynamic universe
    fetch('/api/universe')
      .then(r => r.json())
      .then(data => {
        if (data.universe) {
          setDynamicUniverse(data.universe);
        }
      })
      .catch(err => console.warn('Failed to fetch dynamic universe:', err));
  }, []);

  // Scan for momentum stocks
  const scanMomentumStocks = useCallback(() => {
    const now = Date.now();
    if (now - lastScanRef.current < 30000) return; // Throttle to 30 seconds
    lastScanRef.current = now;

    const results: MomentumStock[] = [];
    const priceMap = stocks as Record<string, QuoteData>;
    const missingHistory: string[] = [];

    // Scan all Indian equities + dynamic universe
    const tickersToScan = [...new Set([...NIFTY_50_TICKERS, ...INDIAN_EQUITY_TICKERS, ...dynamicUniverse])];

    for (const ticker of tickersToScan) {
      const current = priceMap[ticker];
      if (!current || current.price <= 0) continue;

      const hist = getHistory(ticker);
      const hl = getSessionHL(ticker);
      
      // Calculate basic metrics
      const priceChange = current.changePercent || 0;
      const volume = current.volume || 0;
      const prevClose = current.prevClose || current.price;
      
      // Pre-market gap calculation
      let preMarketGap = 0;
      if (hist && hist.length > 0) {
        const lastClose = hist[hist.length - 1].close;
        preMarketGap = ((current.price - lastClose) / lastClose) * 100;
      }

      // Get TA indicators if available
      let ta: TAIndicators | null = null;
      let smartMoney = { accumulation: 50, distribution: 50 };
      let avgVolume = volume;

      if (hist && hist.length >= 50) {
        const candles = buildCandleHistory(hist, current.price, volume, prevClose, hl?.high, hl?.low);
        if (candles.length >= 50) {
          ta = calculateIndicators(candles);
          if (ta) {
            smartMoney = detectSmartMoney(candles, ta);
            avgVolume = ta.volumeSma || volume;
          }
        }
      }

      const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
      const isVolumeDelayed = volume === 0 || volume === null;
      
      // Cross-reference overnight AI announcements FIRST before filtering
      const stockAnnouncements = recentAnnouncements.filter(a => a.symbol === ticker || a.symbol === ticker.replace('.NS', ''));
      let aiMomentumBoost = 0;
      let aiReasoning = null;
      
      if (stockAnnouncements.length > 0) {
        const latest = stockAnnouncements[0];
        const ensemble = latest.ensemble_signal;
        if (ensemble === 'BUY') {
          aiMomentumBoost = 30; // Bumped up for 'BUY' signals
          aiReasoning = '🔥 AI flags highly bullish corporate announcement!';
        } else if (ensemble === 'sell' || ensemble === 'avoid') {
          aiMomentumBoost = -20;
          aiReasoning = '⚠️ Bearish announcement detected, reducing momentum rank.';
        }
      }

      // Skip if below thresholds, BUT allow AI-detected catalysts to bypass these filters entirely!
      if (aiMomentumBoost <= 0) {
        if (!isVolumeDelayed && volume < config.minVolume) continue;
        if (Math.abs(priceChange) < config.minChangePercent && !marketStatus.isPreMarket) continue;
      }

      // Check if we have history. If not, queue it up for lazy loading.
      if (!hist || hist.length < 50) {
        missingHistory.push(ticker);
      }

      // Calculate momentum score
      const momentumScore = ta
        ? calculateMomentumScore(
            priceChange,
            volumeRatio,
            ta.rsi,
            ta.adx,
            ta.macd.histogram,
            (ta.atr / current.price) * 100,
            smartMoney.accumulation,
          )
        : 50;
        
      const finalScore = Math.min(100, Math.max(0, momentumScore + aiMomentumBoost));

      if (finalScore < config.minMomentumScore) continue;

      // Track high-momentum candidates for user review (NOT auto-executed)
      if (finalScore >= 80 && !executedTrades.has(ticker)) {
        setExecutedTrades(prev => new Set(prev).add(ticker));
        // Candidate is flagged in UI for user to review and manually execute
      }

      const momentumRank = getMomentumRank(finalScore);
      
      // Incorporate AI reasoning into premarket predictions
      let preMarketPred;
      if (marketStatus.isPreMarket) {
        preMarketPred = generatePreMarketPrediction(
          ticker,
          prevClose,
          globalCues,
          finalScore
        );
        if (aiReasoning && aiMomentumBoost > 0) {
           preMarketPred.direction = 'BULLISH';
           preMarketPred.confidence = Math.min(99, preMarketPred.confidence + 20);
           preMarketPred.reasoning.unshift(aiReasoning);
        }
      }

      // Generate prediction
      const prediction = marketStatus.isPreMarket && preMarketPred
        ? preMarketPred
        : ta
        ? generateLiveMomentumPrediction(ta, priceChange, volumeRatio, smartMoney.accumulation)
        : {
            direction: (priceChange > 0 ? 'BULLISH' : 'BEARISH') as 'BULLISH' | 'BEARISH',
            confidence: 40,
            expectedMove: Math.abs(priceChange) * 0.5,
            reasoning: ['Limited data — based on price movement only'],
          };

      results.push({
        ticker,
        name: getTickerName(ticker),
        price: current.price,
        change: current.change || 0,
        changePercent: priceChange,
        volume,
        avgVolume,
        volumeRatio: parseFloat(volumeRatio.toFixed(2)),
        momentumScore: finalScore,
        momentumRank,
        ta,
        smartMoney,
        preMarketGap: parseFloat(preMarketGap.toFixed(2)),
        intradayHigh: hl?.high || current.price,
        intradayLow: hl?.low || current.price,
        intradayRange: hl ? parseFloat(((hl.high - hl.low) / hl.low * 100).toFixed(2)) : 0,
        isPreMarket: marketStatus.isPreMarket,
        volatilityRisk: ta ? parseFloat(Math.min(100, (ta.atr / current.price) * 100 * 5).toFixed(1)) : 50,
        prediction,
      });
    }

    // Trigger lazy load for missing histories (it will cause a re-render when MarketDataContext updates)
    if (missingHistory.length > 0 && fetchHistoryBatch) {
      // Fire and forget
      fetchHistoryBatch(missingHistory);
    }

    // Sort by momentum score
    results.sort((a, b) => b.momentumScore - a.momentumScore);
    setMomentumStocks(results.slice(0, 20)); // Top 20
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setLoading(false);
  }, [stocks, getHistory, getSessionHL, config, marketStatus, globalCues]);

  // Initial scan and periodic updates
  useEffect(() => {
    scanMomentumStocks();
    const interval = setInterval(scanMomentumStocks, 30000); // Scan every 30 seconds
    return () => clearInterval(interval);
  }, [scanMomentumStocks]);

  // Global cues fetched from live Yahoo Finance data
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const cues = await fetchRealGlobalCues();
        if (active) setGlobalCues(cues);
      } catch {
        // keep last known values
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const veryHighMomentum = useMemo(() => momentumStocks.filter(s => s.momentumRank === 'VERY_HIGH'), [momentumStocks]);
  const highMomentum = useMemo(() => momentumStocks.filter(s => s.momentumRank === 'HIGH'), [momentumStocks]);
  const moderateMomentum = useMemo(() => momentumStocks.filter(s => s.momentumRank === 'MODERATE'), [momentumStocks]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className="text-xl">🚀</span>
            High Momentum Scanner
          </h2>
          <p className="text-[9px] text-slate-500 font-mono mt-1">
            Pre-market & Intraday momentum detection — Indian equities (9:15 AM - 3:30 PM)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded-full border ${
            marketStatus.isPreMarket
              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              : marketStatus.isLive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              marketStatus.isPreMarket ? 'bg-yellow-500 animate-pulse' :
              marketStatus.isLive ? 'bg-emerald-500 animate-pulse' :
              'bg-slate-500'
            }`} />
            {marketStatus.isPreMarket ? 'PRE-MARKET' : marketStatus.isLive ? 'LIVE' : 'CLOSED'}
          </span>
          {lastUpdated && (
            <span className="text-[8px] text-slate-600 font-mono">↻ {lastUpdated}</span>
          )}
        </div>
      </div>

      {/* Global Cues Banner */}
      {(marketStatus.isPreMarket || marketStatus.isLive) && (
        <div className={`rounded-xl border p-3 ${globalCues.isLive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] font-bold text-yellow-400 uppercase tracking-wider">📡 Pre-Market Indicators</span>
            <span className={`text-[7px] font-mono ${globalCues.isLive ? 'text-emerald-500' : 'text-yellow-500'}`}>
              {globalCues.isLive ? 'LIVE DATA' : 'ESTIMATED'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[10px] font-mono">
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[8px]">US Close</div>
              <div className={`font-bold ${globalCues.usClose != null && globalCues.usClose >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {globalCues.usClose != null ? `${globalCues.usClose >= 0 ? '+' : ''}${globalCues.usClose.toFixed(2)}%` : '\u2014'}
              </div>
              <div className="text-[6px] text-slate-600">{globalCues.usMarketStatus}</div>
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[8px]">Asian Markets</div>
              <div className={`font-bold ${globalCues.asianMarkets != null && globalCues.asianMarkets >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {globalCues.asianMarkets != null ? `${globalCues.asianMarkets >= 0 ? '+' : ''}${globalCues.asianMarkets.toFixed(2)}%` : '\u2014'}
              </div>
              <div className="text-[6px] text-slate-600">{globalCues.asianMarketStatus}</div>
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[8px]">GIFT Nifty</div>
              <div className={`font-bold ${globalCues.giftNifty != null && globalCues.giftNifty >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {globalCues.giftNifty != null ? `${globalCues.giftNifty >= 0 ? '+' : ''}${globalCues.giftNifty.toFixed(2)}%` : '\u2014'}
              </div>
              <div className="text-[6px] text-slate-600">SGX Nifty</div>
            </div>
            <div className="bg-slate-950/50 rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[8px]">VIX</div>
              <div className="font-bold text-purple-400">{globalCues.vix != null ? globalCues.vix.toFixed(1) : '\u2014'}</div>
              <div className="text-[6px] text-slate-600">Fear Index</div>
            </div>
          </div>
          <div className="mt-1.5 text-[6px] text-slate-600 text-center">
            {globalCues.timestamp > 0
              ? `Last updated: ${new Date(globalCues.timestamp).toLocaleTimeString()}`
              : 'Data pending — showing momentum patterns without macro confirmation'}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setConfig(c => ({ ...c, showPreMarket: !c.showPreMarket }))}
          className={`px-3 py-1 text-[9px] font-bold rounded-lg border transition-all ${
            config.showPreMarket
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}
        >
          Pre-Market
        </button>
        <button
          onClick={() => setConfig(c => ({ ...c, showLiveMomentum: !c.showLiveMomentum }))}
          className={`px-3 py-1 text-[9px] font-bold rounded-lg border transition-all ${
            config.showLiveMomentum
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}
        >
          Live Momentum
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 font-mono text-xs animate-pulse">
          Scanning for high momentum stocks…
        </div>
      ) : momentumStocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-emerald-400 font-mono font-bold mb-1">Scanning for Momentum...</h3>
          <p className="text-[10px] text-slate-500 font-mono max-w-sm">
            Fetching history and calculating technicals. This takes about 30 seconds on server startup. If this persists, no momentum setups were found.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* VERY HIGH Momentum */}
          {veryHighMomentum.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-yellow-400 font-mono uppercase tracking-wider">
                  🔥 Very High Momentum ({veryHighMomentum.length})
                </span>
                <span className="h-px flex-1 bg-yellow-500/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {veryHighMomentum.map(stock => (
                  <MomentumCard
                    key={stock.ticker}
                    stock={stock}
                    isSelected={selectedStock === stock.ticker}
                    onClick={() => setSelectedStock(selectedStock === stock.ticker ? null : stock.ticker)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* HIGH Momentum */}
          {highMomentum.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-emerald-400 font-mono uppercase tracking-wider">
                  ⚡ High Momentum ({highMomentum.length})
                </span>
                <span className="h-px flex-1 bg-emerald-500/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {highMomentum.map(stock => (
                  <MomentumCard
                    key={stock.ticker}
                    stock={stock}
                    isSelected={selectedStock === stock.ticker}
                    onClick={() => setSelectedStock(selectedStock === stock.ticker ? null : stock.ticker)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* MODERATE Momentum */}
          {moderateMomentum.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-blue-400 font-mono uppercase tracking-wider">
                  📊 Moderate Momentum ({moderateMomentum.length})
                </span>
                <span className="h-px flex-1 bg-blue-500/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {moderateMomentum.slice(0, 4).map(stock => (
                  <MomentumCard
                    key={stock.ticker}
                    stock={stock}
                    isSelected={selectedStock === stock.ticker}
                    onClick={() => setSelectedStock(selectedStock === stock.ticker ? null : stock.ticker)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Momentum Stock Card Component
function MomentumCard({
  stock,
  isSelected,
  onClick,
}: {
  stock: MomentumStock;
  isSelected: boolean;
  onClick: () => void;
}) {
  const colorClass = getMomentumColor(stock.momentumRank);
  const emoji = getRankEmoji(stock.momentumRank);

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-300 cursor-pointer ${
        isSelected
          ? 'border-emerald-500/50 bg-slate-900/80 shadow-lg shadow-emerald-950/20'
          : 'border-slate-800 bg-slate-950/30 hover:border-slate-700/60 hover:bg-slate-900/50'
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-white">{stock.ticker}</span>
          <span className={`text-[7px] font-mono px-1.5 py-0.5 rounded border ${colorClass}`}>
            {emoji} {stock.momentumRank.replace('_', ' ')}
          </span>
          {stock.isPreMarket && (
            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              PRE
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-mono font-bold text-white">
            ₹{stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`text-[10px] font-mono font-bold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Momentum Score */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[8px] mb-1">
          <span className="text-slate-500 font-mono">Momentum Score</span>
          <span className={`font-mono font-bold ${colorClass.split(' ').pop()}`}>{stock.momentumScore}</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              stock.momentumRank === 'VERY_HIGH'
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                : stock.momentumRank === 'HIGH'
                ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500'
            }`}
            style={{ width: `${stock.momentumScore}%` }}
          />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-[9px] font-mono">
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 text-[7px]">Volume</div>
          <div className="text-slate-300 font-bold">{(stock.volume / 1000).toFixed(0)}K</div>
          <div className="text-[7px] text-slate-600">{stock.volumeRatio}x avg</div>
        </div>
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 text-[7px]">Gap</div>
          <div className={`font-bold ${stock.preMarketGap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stock.preMarketGap >= 0 ? '+' : ''}{stock.preMarketGap.toFixed(1)}%
          </div>
          <div className="text-[7px] text-slate-600">Pre-market</div>
        </div>
        <div className="bg-slate-950/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 text-[7px]">Smart Money</div>
          <div className={`font-bold ${stock.smartMoney.accumulation > 60 ? 'text-emerald-400' : stock.smartMoney.accumulation < 40 ? 'text-red-400' : 'text-slate-400'}`}>
            {stock.smartMoney.accumulation > 60 ? 'ACCUM' : stock.smartMoney.accumulation < 40 ? 'DIST' : 'NEUTRAL'}
          </div>
          <div className="text-[7px] text-slate-600">{stock.smartMoney.accumulation}%</div>
        </div>
      </div>

      {/* Expanded Details */}
      {isSelected && stock.ta && (
        <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-2 animate-fade-in">
          {/* TA Indicators */}
          <div className="grid grid-cols-4 gap-2 text-[8px] font-mono">
            <div>
              <span className="text-slate-500">RSI:</span>
              <span className={`ml-1 font-bold ${stock.ta.rsi > 70 ? 'text-red-400' : stock.ta.rsi > 50 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {stock.ta.rsi.toFixed(0)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">ADX:</span>
              <span className="ml-1 font-bold text-white">{stock.ta.adx.toFixed(0)}</span>
            </div>
            <div>
              <span className="text-slate-500">MACD:</span>
              <span className={`ml-1 font-bold ${stock.ta.macd.histogram > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stock.ta.macd.histogram > 0 ? '+' : ''}{stock.ta.macd.histogram.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">ATR:</span>
              <span className="ml-1 font-bold text-white">{stock.ta.atr.toFixed(2)}</span>
            </div>
          </div>

          {/* Prediction with Verification Info */}
          <div className="bg-slate-950/40 rounded-lg p-2 border-l-2 border-emerald-500/40">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                stock.prediction.direction === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {stock.prediction.direction === 'BULLISH' ? '📈' : '📉'} {stock.prediction.direction}
              </span>
              <span className="text-[8px] text-slate-500">Confidence: </span>
              <span className="text-[8px] font-bold text-white">{stock.prediction.confidence}%</span>
              <span className={`text-[6px] font-mono px-1 py-0.5 rounded ${
                stock.ta ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                {stock.ta ? 'TA-BASED' : 'PRICE-ONLY'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-400 mb-1">
              <span>Exp: <span className={`${stock.prediction.expectedMove >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stock.prediction.expectedMove >= 0 ? '+' : ''}{stock.prediction.expectedMove.toFixed(2)}%
              </span></span>
              <span>Vol: <span className={stock.volatilityRisk > 50 ? 'text-red-400' : 'text-slate-300'}>
                {stock.volumeRatio.toFixed(1)}x
              </span></span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {stock.prediction.reasoning.slice(0, 2).map((r, i) => (
                <div key={i} className="text-[7px] text-slate-500 flex items-start gap-1">
                  <span className="text-emerald-500 shrink-0">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
            {stock.ta && (
              <div className="mt-1 flex gap-1 text-[6px] text-slate-600">
                <span>RSI({stock.ta.rsi.toFixed(0)})</span>
                <span>ADX({stock.ta.adx.toFixed(0)})</span>
                <span>ATR({stock.ta.atr.toFixed(1)})</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}