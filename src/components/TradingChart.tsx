'use client';

import React, { useEffect, useRef, useState, memo, FormEvent } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts';
import { useMarketData } from '@/lib/MarketDataContext';
import { type OHLC } from '@/lib/technicalAnalysis';
import { generatePatternSignal, type PatternSignal } from '@/lib/patternDetection';
import { INDIAN_EQUITY_TICKERS, TICKER_NAMES, tickerToYahoo } from '@/lib/marketConfig';
import { Search } from 'lucide-react';

interface TradingChartProps {
  variant?: 'card' | 'page' | 'embedded';
  symbol?: string;
  theme?: 'light' | 'dark';
  height?: number | string;
  width?: number | string;
}

function normalizeChartSymbol(sym: string): string {
  const upper = sym.toUpperCase();
  if (upper.includes('NIFTY BANK')) return '^NSEBANK';
  if (upper.includes('NIFTY') || upper === 'NSE:NIFTY') return '^NSEI';
  if (upper.includes('SENSEX') || upper.includes('BSE')) return '^BSESN';
  
  if (upper.includes(':')) {
    return upper.split(':')[1];
  }
  return upper;
}

// Helper to compute SMA
function calculateSMA(data: {time: any, value: number}[], period: number) {
  const result: {time: any, value: number}[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

// Helper to compute BB
function calculateBB(data: {time: any, value: number}[], period: number, stdDevMultiplier: number) {
  const upper: {time: any, value: number}[] = [];
  const lower: {time: any, value: number}[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    const sma = sum / period;
    
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(data[i - j].value - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    
    upper.push({ time: data[i].time, value: sma + stdDevMultiplier * stdDev });
    lower.push({ time: data[i].time, value: sma - stdDevMultiplier * stdDev });
  }
  return { upper, lower };
}

function TradingChartComponent({
  variant = 'card',
  symbol: initialSymbol = 'RELIANCE',
  theme = 'dark',
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  // Chart Instances
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);

  const { fetchHistory, stocks, indices, isLive } = useMarketData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search State
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const [searchInput, setSearchInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const suggestions = searchInput.trim() ? INDIAN_EQUITY_TICKERS.filter((t: string) => 
    t.toLowerCase().includes(searchInput.toLowerCase()) || 
    (TICKER_NAMES[t] && TICKER_NAMES[t].toLowerCase().includes(searchInput.toLowerCase()))
  ).slice(0, 8) : [];
  
  // AI Insight State
  const [patternSignal, setPatternSignal] = useState<PatternSignal | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);

  const mappedSymbol = normalizeChartSymbol(activeSymbol);

  // Load Historical Data & Compute Indicators
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const history = await fetchHistory(mappedSymbol);
        if (!isMounted) return;
        
        if (!history || history.length === 0) {
          setError(`No data found for ${activeSymbol}`);
          setLoading(false);
          return;
        }

        if (chartRef.current && seriesRef.current && volumeSeriesRef.current) {
          // Format OHLC data
          const formattedData = history.map((d: OHLC) => ({
            time: (d.date ? Math.floor(d.date / 1000) : 0) as any,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          })).filter(d => d.time > 0);
          
          formattedData.sort((a, b) => (a.time as number) - (b.time as number));
          
          // Remove duplicates
          const uniqueData = [];
          let lastTime = 0;
          for (const d of formattedData) {
            if (d.time > lastTime) {
              uniqueData.push(d);
              lastTime = d.time as number;
            }
          }

          if (uniqueData.length > 0) {
            const lastData = uniqueData[uniqueData.length - 1];
            (chartRef.current as any)._lastCandleTime = lastData.time;
            (chartRef.current as any)._lastCandle = { ...lastData };
          }

          seriesRef.current.setData(uniqueData);

          // Format Volume data
          const volumeData = uniqueData.map(d => ({
            time: d.time,
            value: history.find(h => (h.date ? Math.floor(h.date/1000) : 0) === d.time)?.volume || 0,
            color: d.close >= d.open ? '#22c55e80' : '#ef444480'
          }));
          volumeSeriesRef.current.setData(volumeData);

          // Compute Indicators
          const closePrices = uniqueData.map(d => ({ time: d.time, value: d.close }));
          
          if (ma20Ref.current) {
            ma20Ref.current.setData(calculateSMA(closePrices, 20));
          }
          if (ma50Ref.current) {
            ma50Ref.current.setData(calculateSMA(closePrices, 50));
          }
          if (bbUpperRef.current && bbLowerRef.current) {
            const bb = calculateBB(closePrices, 20, 2);
            bbUpperRef.current.setData(bb.upper);
            bbLowerRef.current.setData(bb.lower);
          }

          const pSignal = generatePatternSignal(mappedSymbol, history);
          setPatternSignal(pSignal);

          // Only auto-zoom to fit when loading a new symbol, 
          // otherwise it ruins the user's manual zoom level on data refresh.
          if (chartRef.current.timeScale().getVisibleRange() === null || (chartRef.current as any)._lastFittedSymbol !== mappedSymbol) {
            chartRef.current.timeScale().fitContent();
            (chartRef.current as any)._lastFittedSymbol = mappedSymbol;
          }
        }
      } catch (err) {
        if (isMounted) setError('Failed to load chart data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setTimeout(loadData, 50);

    return () => {
      isMounted = false;
    };
  }, [activeSymbol, mappedSymbol, fetchHistory]);

  // Handle live price updates & High-Frequency Streaming Simulator
  const latestTrueData = useRef<any>(null);
  const simulatedPriceRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!isLive || !seriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;
    
    const liveData = mappedSymbol.startsWith('^') ? indices[mappedSymbol] : stocks[mappedSymbol];
    if (liveData && liveData.price > 0 && liveData.timestamp) {
      latestTrueData.current = { ...liveData, ts: Math.floor(liveData.timestamp / 1000) };
      
      const targetTime = (chartRef.current as any)._lastCandleTime;
      const lastCandle = (chartRef.current as any)._lastCandle;
      
      if (targetTime && lastCandle) {
        // Sync to true price on real update
        simulatedPriceRef.current = liveData.price;
        
        // Update the intraday candle bounds based on the new tick price, NOT the daily OHLC
        lastCandle.close = liveData.price;
        if (liveData.price > lastCandle.high) lastCandle.high = liveData.price;
        if (liveData.price < lastCandle.low) lastCandle.low = liveData.price;
        
        seriesRef.current.update({
          time: targetTime as any,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close
        });
        if (liveData.volume) {
          volumeSeriesRef.current.update({
            time: targetTime as any,
            value: liveData.volume,
            color: liveData.change >= 0 ? '#22c55e80' : '#ef444480'
          });
        }
      }
    }
  }, [stocks, indices, isLive, mappedSymbol]);


  // Init Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDark = theme === 'dark';
    const bg = isDark ? '#0f172a' : '#f8fafc';
    const grid = isDark ? '#1e293b' : '#e2e8f0';
    const text = isDark ? '#94a3b8' : '#64748b';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
      },
      grid: {
        vertLines: { color: grid, style: 1 },
        horzLines: { color: grid, style: 1 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#6366f1', width: 1, style: 3 },
        horzLine: { color: '#6366f1', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: grid,
      },
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    // Candlesticks
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = series;

    // Volume
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '', 
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Indicators
    ma20Ref.current = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, crosshairMarkerVisible: false });
    ma50Ref.current = chart.addLineSeries({ color: '#a855f7', lineWidth: 1, crosshairMarkerVisible: false });
    bbUpperRef.current = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false });
    bbLowerRef.current = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      ma20Ref.current = null;
      ma50Ref.current = null;
      bbUpperRef.current = null;
      bbLowerRef.current = null;
    };
  }, [theme]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveSymbol(searchInput.trim().toUpperCase());
      setSearchInput('');
    }
  };

  return (
    <div className={`w-full relative flex flex-col rounded-xl overflow-hidden border border-slate-800 shadow-xl ${variant === 'page' ? 'h-[calc(100vh-80px)]' : 'h-[500px]'}`}>
      
      {/* Top Bar with Search */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none p-3 flex justify-between items-start">
        
        {/* Search Form & Suggestions */}
        <div className="relative pointer-events-auto flex flex-col">
          <form 
            onSubmit={handleSearchSubmit} 
            className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg shadow-lg flex items-center overflow-hidden"
          >
            <div className="px-3 py-2 border-r border-slate-700 bg-slate-800/50">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              placeholder={activeSymbol}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="bg-transparent border-none outline-none text-white text-sm font-bold tracking-wide px-3 py-2 w-32 sm:w-48 placeholder:text-slate-500 uppercase"
            />
            {loading && (
              <div className="pr-3 flex items-center">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              </div>
            )}
          </form>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50">
              {suggestions.map(sym => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={() => {
                    setActiveSymbol(sym);
                    setSearchInput('');
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 focus:bg-slate-800 outline-none flex flex-col gap-0.5 border-b border-slate-800/50 last:border-0"
                >
                  <span className="font-bold text-sm text-blue-400 tracking-wide">{sym}</span>
                  <span className="text-[10px] text-slate-400 truncate w-full pr-2">
                    {TICKER_NAMES[sym] || sym}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg p-2 flex flex-col gap-1.5 text-[10px] font-mono shadow-lg pointer-events-none opacity-80 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-blue-500 rounded-full" />
            <span className="text-slate-300">MA(20)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-purple-500 rounded-full" />
            <span className="text-slate-300">MA(50)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-px border-t border-dashed border-cyan-500" />
            <span className="text-slate-300">BB(20,2)</span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      {error ? (
        <div className="flex-1 flex items-center justify-center bg-slate-900">
          <div className="text-red-400 font-mono text-sm border border-red-500/20 bg-red-500/10 p-4 rounded-lg">
            ⚠ {error}
          </div>
        </div>
      ) : (
        <div ref={chartContainerRef} className="flex-1 w-full min-h-0 relative" />
      )}

      {/* AI Insight Panel */}
      {showAIPanel && patternSignal && (
        <div className="absolute z-10 max-sm:inset-x-2 max-sm:bottom-14 max-sm:top-auto max-sm:max-w-none sm:top-14 sm:right-2 sm:left-auto sm:bottom-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-lg p-3 min-w-0 sm:min-w-[200px] sm:max-w-[260px] shadow-2xl shadow-black/40 max-h-[40vh] sm:max-h-none overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">🧠 AI Insight</span>
            <button type="button" onClick={() => setShowAIPanel(false)} className="touch-target text-slate-600 hover:text-slate-400 text-[12px] px-1">✕</button>
          </div>

          {/* Pattern signals */}
          {patternSignal && patternSignal.patterns.length > 0 ? (
            <div className="mb-2">
              <div className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border inline-block mb-2 ${
                patternSignal.netDirection === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-900/40' :
                patternSignal.netDirection === 'BEARISH' ? 'bg-red-500/15 text-red-400 border-red-900/40' :
                'bg-slate-500/15 text-slate-400 border-slate-700'
              }`}>
                {patternSignal.netDirection} Bias {patternSignal.netConfidence}%
              </div>
              {patternSignal.patterns.slice(0, 3).map((p, i) => (
                <div key={i} className="text-[10px] font-mono text-slate-300 flex items-start gap-1 py-1">
                  <span className={`shrink-0 mt-0.5 ${p.direction === 'BULLISH' ? 'text-emerald-400' : p.direction === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {p.direction === 'BULLISH' ? '▲' : p.direction === 'BEARISH' ? '▼' : '◆'}
                  </span>
                  <span><b>{p.name}</b> — {p.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-[10px] font-mono">No candlestick patterns detected.</div>
          )}
        </div>
      )}

      {/* AI View bar */}
      <div 
        className="absolute bottom-6 sm:bottom-12 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-lg bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300 z-10 flex flex-wrap items-center justify-center gap-2 text-center cursor-pointer shadow-lg hover:border-slate-500 transition-colors"
        onClick={() => setShowAIPanel(!showAIPanel)}
      >
        <span>🧠</span>
        {patternSignal && patternSignal.patterns.length > 0 ? (
          <>
            <span className={patternSignal.netDirection === 'BULLISH' ? 'text-emerald-400' : patternSignal.netDirection === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}>
              AI View: {patternSignal.netDirection} ({patternSignal.netConfidence}%)
            </span>
            <span className="text-slate-400">| {patternSignal.primaryPattern?.name}</span>
          </>
        ) : (
          <span className="text-slate-400">AI View: Analyzing Patterns... Click for details</span>
        )}
      </div>

    </div>
  );
}

export default memo(TradingChartComponent);
