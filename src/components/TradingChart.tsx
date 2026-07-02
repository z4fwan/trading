'use client';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, type Time, CrosshairMode, ColorType } from 'lightweight-charts';
import { useMarketData, type QuoteData } from '@/lib/MarketDataContext';
import { calculateIndicators, type OHLC, type TAIndicators } from '@/lib/technicalAnalysis';
import { ALL_TICKERS, INTERNATIONAL_TICKERS, INDEX_SYMBOLS, INDEX_NAMES, getTickerName, tickerToYahoo, isIndianTicker } from '@/lib/marketConfig';
import { tickerCurrency } from '@/components/LiveTickerPrice';
import SmoothPrice from '@/components/SmoothPrice';
import { detectPatterns, generatePatternSignal, type CandlePattern } from '@/lib/patternDetection';

interface ChartCandle { time: Time; open: number; high: number; low: number; close: number; volume: number; }
interface StockOption { ticker: string; label: string; isIndex: boolean; }

const INDEX_OPTIONS: StockOption[] = INDEX_SYMBOLS.map(s => ({ ticker: s, label: INDEX_NAMES[s] || s, isIndex: true }));
const STOCK_OPTIONS: StockOption[] = ALL_TICKERS.map(t => ({ ticker: t, label: `${t} — ${getTickerName(t)}`, isIndex: false }));
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1wk', '1mo'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const TIMEFRAME_GROUPS = [
  { label: 'Min', items: ['1m', '5m', '15m'] as Timeframe[] },
  { label: 'Hr', items: ['1h', '4h'] as Timeframe[] },
  { label: 'Day', items: ['1d', '1wk', '1mo'] as Timeframe[] },
];

const REFRESH_MS: Record<string, number> = {
  '1m': 5_000, '5m': 10_000, '15m': 15_000, '1h': 20_000,
  '4h': 30_000, '1d': 15_000, '1wk': 60_000, '1mo': 60_000,
};
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  return fetch(url).then(r => {
    if (!r.ok && retries > 0) {
      return new Promise<Response>(resolve => setTimeout(resolve, RETRY_DELAY_MS)).then(() => fetchWithRetry(url, retries - 1));
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  });
}

function makeSearchOptions(query: string): StockOption[] {
  const q = query.toUpperCase();
  if (!q) return [];
  return [...INDEX_OPTIONS, ...STOCK_OPTIONS]
    .filter(s => s.ticker.toUpperCase().includes(q) || s.label.toUpperCase().includes(q))
    .slice(0, 20);
}

function getWatchlist(): string[] {
  try { return JSON.parse(localStorage.getItem('watchlist') || '[]'); } catch { return []; }
}

function saveWatchlist(list: string[]) {
  localStorage.setItem('watchlist', JSON.stringify(list));
}

type ChartVariant = 'card' | 'page' | 'embedded';

export default function TradingChart({ variant = 'card' }: { variant?: ChartVariant }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // We are retaining data fetching for AI Overlays, but visualization is handled by TradingView iframe.
  const { getHistory, stocks, indices, connectionStatus, pricesStreaming } = useMarketData();
  const [selectedTicker, setSelectedTicker] = useState('^NSEI');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const watchlistRef = useRef<HTMLDivElement>(null);
  const [statusTick, setStatusTick] = useState(0);
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [watchlist, setWatchlist] = useState<string[]>(getWatchlist);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;
  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;
  const [lastUpdated, setLastUpdated] = useState(0);
  const liveCandleRef = useRef<{ time: Time; open: number; high: number; low: number; close: number } | null>(null);
  const cancellerRef = useRef(false);

  const quoteData: QuoteData | undefined = selectedTicker.startsWith('^') ? indices[selectedTicker] : stocks[selectedTicker];

  function toChartCandles(hist: OHLC[]): ChartCandle[] {
    const seen = new Set<number>();
    const out: ChartCandle[] = [];
    for (const c of hist) {
      if (c.date == null) continue;
      if (seen.has(c.date)) continue;
      seen.add(c.date);
      out.push({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    }
    return out;
  }

  // Derived: ohlc from quote data or candles
  const ohlc = useMemo(() => {
    if (quoteData?.price) {
      return { open: quoteData.open || 0, high: quoteData.high || 0, low: quoteData.low || 0, close: quoteData.price, volume: quoteData.volume || 0, change: quoteData.change || 0, changePercent: quoteData.changePercent || 0 };
    }
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      return { open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume, change: 0, changePercent: 0 };
    }
    return { open: 0, high: 0, low: 0, close: 0, volume: 0, change: 0, changePercent: 0 };
  }, [quoteData, candles]);

  // Derived: TA and patterns from candles
  const ta = useMemo(() => {
    if (candles.length < 50) return null;
    return calculateIndicators(candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
  }, [candles]);

  const patterns = useMemo(() => {
    if (candles.length < 50) return [];
    return detectPatterns(candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
  }, [candles]);

  const patternSignal = useMemo(() => candles.length >= 3 ? generatePatternSignal(selectedTicker, candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))) : null, [candles, selectedTicker]);

  const latestCandle = useMemo(() => {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    if (!quoteData?.price) return null;
    const currentTime = last.time;
    if (!liveCandleRef.current || liveCandleRef.current.time !== currentTime) {
      liveCandleRef.current = { time: currentTime, open: last.open, high: last.high, low: last.low, close: last.close };
    }
    const ref = liveCandleRef.current;
    ref.high = Math.max(ref.high, quoteData.price);
    ref.low = Math.min(ref.low, quoteData.price);
    ref.close = quoteData.price;
    return { time: ref.time as Time, open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: quoteData.volume || last.volume };
  }, [candles, quoteData]);

  // Fetch history with retry, cancellation, and error state
  useEffect(() => {
    cancellerRef.current = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    liveCandleRef.current = null;
    setCandles([]);
    setLastUpdated(0);
    setFetchError(null);

    const fetchHistory = () => {
      if (cancellerRef.current) return;
      if (['1m', '5m', '15m', '1h', '4h'].includes(timeframe)) {
        // intraday must fetch from API
      } else {
        const hist = getHistoryRef.current(selectedTicker);
        if (hist && hist.length >= 5 && timeframe === '1d') {
          setCandles(toChartCandles(hist));
          setLastUpdated(Date.now());
          return;
        }
      }
      setHistoryLoading(true);
      setFetchError(null);
      const yahooSym = selectedTicker.startsWith('^') ? selectedTicker : tickerToYahoo(selectedTicker);
      fetchWithRetry(`/api/history?symbol=${encodeURIComponent(yahooSym)}&interval=${timeframe}`)
        .then(r => r.json())
        .then(data => {
          if (cancellerRef.current) return;
          if (data.candles && data.candles.length >= 5) {
            setCandles(toChartCandles(data.candles));
            setLastUpdated(Date.now());
          } else {
            setFetchError('Insufficient data for this timeframe');
          }
        })
        .catch((err: Error) => {
          if (!cancellerRef.current) setFetchError(err.message || 'Failed to load chart data');
        })
        .finally(() => { if (!cancellerRef.current) setHistoryLoading(false); });
    };

    fetchHistory();

    const intervalMs = REFRESH_MS[timeframe] || 60_000;
    const scheduleNext = () => {
      if (cancellerRef.current) return;
      pollTimer = setTimeout(() => {
        if (cancellerRef.current) return;
        fetchHistory();
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();

    return () => { cancellerRef.current = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [selectedTicker, timeframe]);

  // Re-enable lightweight-charts rendering for AI Markers and TA lines
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;
    
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0a0e17' }, textColor: '#64748b' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
    });
    
    candleSeries.setData(candles);

    // Support / Resistance Lines
    if (ta) {
      candleSeries.createPriceLine({ price: ta.support, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Support' });
      candleSeries.createPriceLine({ price: ta.resistance, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Resistance' });
    }

    // AI Markers (Pattern Signals)
    if (patternSignal && patternSignal.patterns.length > 0) {
      const markers = patternSignal.patterns.map(p => ({
        time: candles[candles.length - 1].time,
        position: p.direction === 'BULLISH' ? 'belowBar' : 'aboveBar',
        color: p.direction === 'BULLISH' ? '#10b981' : p.direction === 'BEARISH' ? '#ef4444' : '#eab308',
        shape: p.direction === 'BULLISH' ? 'arrowUp' : p.direction === 'BEARISH' ? 'arrowDown' : 'circle',
        text: p.name,
        size: 2
      } as any));
      candleSeries.setMarkers(markers);
    }

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, ta, patternSignal]);

  // Real-time price update — uses series.update() for efficient last-candle tick
  useEffect(() => {
    if (!liveCandleRef.current || !quoteData) return;
  }, [quoteData]);

  useEffect(() => {
    const id = setInterval(() => setStatusTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(t)) setShowSearch(false);
      if (watchlistRef.current && !watchlistRef.current.contains(t)) setShowWatchlist(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleWatchlist = useCallback((ticker: string) => {
    setWatchlist(prev => {
      const next = prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const searchResults = useMemo(() => makeSearchOptions(searchQuery), [searchQuery]);
  const isUp = ohlc.close >= ohlc.open;       // current candle direction
  const isGreen = ohlc.change >= 0;            // daily P&L direction
  const selectedLabel = INDEX_NAMES[selectedTicker] || getTickerName(selectedTicker) || selectedTicker;

  const shellClass = variant === 'card'
    ? 'relative w-full h-full flex flex-col select-none rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950 shadow-2xl'
    : 'relative w-full h-full min-h-0 flex flex-col select-none overflow-hidden bg-slate-950';

  const ageMs = lastUpdated > 0 ? Date.now() - lastUpdated : Infinity;
  void statusTick;

  const selectTicker = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setShowSearch(false);
    setSearchQuery('');
    setShowWatchlist(false);
  }, []);

  return (
    <div className={shellClass}>
      <div className="flex flex-col gap-2 px-2 sm:px-3 py-2 bg-slate-900/90 border-b border-slate-800/60 backdrop-blur-md shrink-0 z-20">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Search */}
          <div className="relative" ref={searchRef}>
            <input id="chart-ticker-search" name="chartSearch" type="search" value={showSearch ? searchQuery : `${selectedTicker} — ${selectedLabel}`}
              onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => { setSearchQuery(''); setShowSearch(true); }}
              placeholder="Search stock..."
              className="w-32 sm:w-36 md:w-48 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-[10px] sm:text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer" />
            {showSearch && (
              <div className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl shadow-black/50 backdrop-blur-xl z-50 min-w-[280px] sm:min-w-[360px] max-h-[300px] sm:max-h-[400px] overflow-y-auto">
                {searchResults.length === 0 && searchQuery.length > 0 && (
                  <div className="px-3 py-4 text-[10px] font-mono text-slate-500 text-center">No matches</div>
                )}
                {searchResults.length === 0 && searchQuery.length === 0 && (
                  <div className="px-3 py-1.5 text-[8px] font-mono text-slate-600">
                    <div className="font-bold text-slate-500 px-3 py-1 uppercase tracking-wider">Indices</div>
                    {INDEX_OPTIONS.map(s => (
                      <button key={s.ticker} type="button" onClick={() => selectTicker(s.ticker)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-all hover:bg-slate-800/60 ${selectedTicker === s.ticker ? 'text-emerald-400 bg-slate-800/40' : 'text-slate-400'}`}>{s.label}</button>
                    ))}
                    <div className="font-bold text-slate-500 px-3 py-1 mt-1 uppercase tracking-wider border-t border-slate-800/50 pt-2">Watchlist ({watchlist.length})</div>
                    {watchlist.length === 0 && <div className="text-slate-600 px-3 py-2 text-[9px]">Click ★ to add stocks to your watchlist</div>}
                    {watchlist.map(t => (
                      <button key={t} type="button" onClick={() => selectTicker(t)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-all hover:bg-slate-800/60 flex items-center justify-between ${selectedTicker === t ? 'text-emerald-400 bg-slate-800/40' : 'text-slate-400'}`}>
                        <span>{t} — {getTickerName(t)}</span>
                        <span className="text-yellow-400 text-[8px]">★</span>
                      </button>
                    ))}
                    <div className="font-bold text-slate-500 px-3 py-1 mt-1 uppercase tracking-wider border-t border-slate-800/50 pt-2">Stocks ({ALL_TICKERS.length})</div>
                    <div className="text-slate-600 px-3 py-2 text-[9px]">Type to search all stocks...</div>
                  </div>
                )}
                {searchResults.map(s => (
                  <div
                    key={s.ticker}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectTicker(s.ticker)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTicker(s.ticker); } }}
                    className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-all hover:bg-slate-800/60 flex items-center justify-between cursor-pointer ${selectedTicker === s.ticker ? 'text-emerald-400 bg-slate-800/40' : 'text-slate-400'}`}
                  >
                    <span className="min-w-0 truncate pr-2">{s.isIndex ? s.label : s.ticker}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8px] text-slate-600">{s.isIndex ? 'INDEX' : (INTERNATIONAL_TICKERS.includes(s.ticker) ? 'US' : 'NSE')}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleWatchlist(s.ticker); }}
                        className={`text-[10px] touch-target ${watchlist.includes(s.ticker) ? 'text-yellow-400' : 'text-slate-700 hover:text-slate-500'}`}
                        aria-label={`${watchlist.includes(s.ticker) ? 'Remove from' : 'Add to'} watchlist`}
                      >
                        {watchlist.includes(s.ticker) ? '★' : '☆'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative shrink-0" ref={watchlistRef}>
            <button
              type="button"
              onClick={() => setShowWatchlist(w => !w)}
              className="touch-target px-2 py-1.5 text-[9px] sm:text-[10px] font-mono rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-yellow-400 hover:border-yellow-500/40 transition-all"
              aria-label={`${showWatchlist ? 'Hide' : 'Show'} watchlist (${watchlist.length} items)`}
              aria-expanded={showWatchlist}
            >
              ★ <span className="text-[8px]">{watchlist.length}</span>
            </button>
            {showWatchlist && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl w-[min(18rem,85vw)] max-h-[50vh] overflow-y-auto custom-scrollbar">
                <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-800">Watchlist ({watchlist.length})</div>
                {watchlist.length === 0 && (
                  <div className="px-3 py-4 text-[9px] text-slate-600 text-center font-mono">Click ☆ on any symbol to add it.</div>
                )}
                {watchlist.map(t => {
                  const q = t.startsWith('^') ? indices[t] : stocks[t];
                  const cur = tickerCurrency(t);
                  return (
                    <div
                      key={t}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectTicker(t)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTicker(t); } }}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-800/40 cursor-pointer transition-all"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono font-bold text-white truncate">{t}</div>
                        <div className="text-[8px] text-slate-600 truncate">{getTickerName(t)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-mono font-bold text-white">{q?.price ? <SmoothPrice value={q.price} decimals={2} prefix={cur} /> : '—'}</div>
                        {q && (
                          <div className={`text-[8px] font-mono font-bold ${q.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleWatchlist(t); }}
                        className="text-yellow-400 text-[10px] shrink-0 hover:text-yellow-300"
                        aria-label="Remove from watchlist"
                      >
                        ★
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="tab-scroll scrollbar-none flex-1 min-w-0 max-w-full bg-slate-800/60 border border-slate-700/60 rounded-lg p-0.5">
            <div className="flex divide-x divide-slate-700/40">
            {TIMEFRAME_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-0.5 px-0.5 shrink-0">
                {group.items.map(tf => (
                  <button key={tf} type="button" onClick={() => setTimeframe(tf)}
                    className={`px-1.5 sm:px-2 py-1 text-[8px] sm:text-[9px] font-bold font-mono rounded-md transition-all shrink-0 ${
                      timeframe === tf
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-500 hover:text-white hover:bg-slate-700/40'
                    }`}>
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            ))}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button type="button" className="px-3 py-1.5 text-[10px] font-bold font-mono rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">BUY</button>
            <button type="button" className="px-3 py-1.5 text-[10px] font-bold font-mono rounded-lg bg-red-500/15 text-red-400 border border-red-500/30">SELL</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] sm:text-[10px] font-mono min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          {historyLoading ? (
            <span className="text-slate-500 animate-pulse">Loading OHLC…</span>
          ) : ohlc.close > 0 ? (
            <>
              <div className="flex items-center gap-1"><span className="text-slate-500">O</span><span className={isUp ? 'text-emerald-400' : 'text-red-400'}>{ohlc.open.toFixed(2)}</span></div>
              <div className="flex items-center gap-1"><span className="text-slate-500">H</span><span className={isUp ? 'text-emerald-400' : 'text-red-400'}>{ohlc.high.toFixed(2)}</span></div>
              <div className="flex items-center gap-1"><span className="text-slate-500">L</span><span className={isUp ? 'text-emerald-400' : 'text-red-400'}>{ohlc.low.toFixed(2)}</span></div>
              <div className="flex items-center gap-1"><span className="text-slate-500">C</span><span className={`font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>{ohlc.close.toFixed(2)}</span></div>
              <div className={`font-bold ${isGreen ? 'text-emerald-400' : 'text-red-400'}`}>{ohlc.change >= 0 ? '+' : ''}{ohlc.change.toFixed(2)} ({ohlc.changePercent >= 0 ? '+' : ''}{ohlc.changePercent.toFixed(2)}%)</div>
              <div className="text-slate-500 hidden sm:block">Vol {(ohlc.volume / 1e6).toFixed(2)}M</div>
              {lastUpdated > 0 && (
                <div className="flex items-center gap-1 text-slate-600">
                  <span className={`h-1.5 w-1.5 rounded-full ${ageMs < 10000 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                  {ageMs < 1000 ? 'now' : `${Math.round(ageMs / 1000)}s ago`}
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-600">Awaiting quote…</span>
          )}
          </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          <button type="button" onClick={() => setShowVolume(!showVolume)}
            className={`px-2 py-1 text-[8px] font-mono rounded-lg border transition-all ${showVolume ? 'bg-slate-800/60 text-slate-400 border-slate-700/50' : 'bg-slate-800/30 text-slate-600 border-slate-800'}`}
            aria-label={`${showVolume ? 'Hide' : 'Show'} volume`}>
            VOL
          </button>
          <button type="button" onClick={() => setShowAIPanel(!showAIPanel)}
            className={`px-2 py-1 text-[8px] font-mono rounded-lg border transition-all ${showAIPanel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800/40 text-slate-500 border-slate-700/40'}`}
            aria-label={`${showAIPanel ? 'Hide' : 'Show'} AI analysis panel`}>
            {showAIPanel ? '🧠 AI' : '🤖 AI'}
          </button>
          {ta && (
            <span className={`text-[8px] font-bold font-mono px-2 py-0.5 rounded-full border ${ta.rsi > 60 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : ta.rsi < 40 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
              {ta.rsi > 60 ? 'Bullish' : ta.rsi < 40 ? 'Bearish' : 'Neutral'} ({ta.rsi.toFixed(0)})
            </span>
          )}
          <div className={`flex items-center gap-1.5 text-[8px] font-mono px-2 py-1 rounded-full border ${
            connectionStatus === 'disconnected' ? 'text-red-400 bg-red-950/30 border-red-900/50'
              : !pricesStreaming ? 'text-amber-400 bg-amber-950/30 border-amber-900/50'
              : ageMs < 15000 ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50'
              : 'text-slate-500 bg-slate-950/30 border-slate-800'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              connectionStatus === 'disconnected' ? 'bg-red-500'
                : !pricesStreaming ? 'bg-amber-500'
                : ageMs < 15000 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'
            }`} />
            {connectionStatus === 'disconnected' ? 'OFFLINE'
              : !pricesStreaming ? 'CLOSED'
              : ageMs < 5000 ? '◉ LIVE'
              : ageMs < 60000 ? 'RT' : 'STALE'}
          </div>
        </div>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 min-w-0">
        <div ref={chartContainerRef} className="absolute inset-0 w-full h-full rounded-b-xl overflow-hidden" />

        {/* Error overlay */}
        {fetchError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-20 pointer-events-none">
            <div className="text-center">
              <div className="text-red-400 text-[11px] font-mono mb-1">⚠ {fetchError}</div>
              <div className="text-slate-500 text-[8px] font-mono">Retrying automatically…</div>
            </div>
          </div>
        )}

        {/* S/R levels overlay */}
        {ta && (
          <div className="absolute top-2 left-2 max-sm:top-auto max-sm:bottom-20 bg-slate-900/80 backdrop-blur-md border border-slate-800/50 rounded-lg p-2 text-[8px] font-mono space-y-1 pointer-events-none z-10 min-w-[90px]">
            <div className="text-slate-500 uppercase tracking-wider text-[7px] font-bold">Levels</div>
            <div className="text-emerald-400/80">S: {ta.support.toFixed(2)}</div>
            <div className="text-red-400/80">R: {ta.resistance.toFixed(2)}</div>
          </div>
        )}

        {/* TA indicators */}
        {ta && !showAIPanel && (
          <div className="absolute top-2 right-2 max-sm:hidden bg-slate-900/80 backdrop-blur-md border border-slate-800/50 rounded-lg p-2.5 text-[8px] font-mono space-y-1 pointer-events-none z-10 min-w-[110px]">
            <div className="text-slate-500 uppercase tracking-wider text-[7px] font-bold">Indicators</div>
            <div className="flex justify-between"><span className="text-slate-500">RSI</span><span className={ta.rsi > 60 ? 'text-emerald-400' : ta.rsi < 40 ? 'text-red-400' : 'text-yellow-400'}>{ta.rsi.toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">ADX</span><span className="text-blue-400">{ta.adx.toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">ATR</span><span className="text-slate-300">{ta.atr.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">ST</span><span className={ta.supertrend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'}>{ta.supertrend.direction.toUpperCase()}</span></div>
          </div>
        )}

        {/* AI Insight Panel */}
        {showAIPanel && (patternSignal || ta) && (
          <div className="absolute z-10 max-sm:inset-x-2 max-sm:bottom-14 max-sm:top-auto max-sm:max-w-none sm:top-2 sm:right-2 sm:left-auto sm:bottom-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-lg p-3 min-w-0 sm:min-w-[200px] sm:max-w-[260px] shadow-2xl shadow-black/40 max-h-[40vh] sm:max-h-none overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[7px] font-bold text-emerald-400 uppercase tracking-wider font-mono">🧠 AI Insight</span>
              <button type="button" onClick={() => setShowAIPanel(false)} className="touch-target text-slate-600 hover:text-slate-400 text-[10px] px-1">✕</button>
            </div>

            {/* Pattern signals */}
            {patternSignal && patternSignal.patterns.length > 0 && (
              <div className="mb-2">
                <div className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border inline-block mb-1 ${
                  patternSignal.netDirection === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-900/40' :
                  patternSignal.netDirection === 'BEARISH' ? 'bg-red-500/15 text-red-400 border-red-900/40' :
                  'bg-slate-500/15 text-slate-400 border-slate-700'
                }`}>
                  {patternSignal.netDirection} Bias {patternSignal.netConfidence}%
                </div>
                {patternSignal.patterns.slice(0, 3).map((p, i) => (
                  <div key={i} className="text-[7px] font-mono text-slate-300 flex items-start gap-1 py-0.5">
                    <span className={`shrink-0 mt-0.5 ${p.direction === 'BULLISH' ? 'text-emerald-400' : p.direction === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {p.direction === 'BULLISH' ? '▲' : p.direction === 'BEARISH' ? '▼' : '◆'}
                    </span>
                    <span><b>{p.name}</b> — {p.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* TA-based direction */}
            {ta && (
              <div className="space-y-1 text-[7px] font-mono border-t border-slate-800/60 pt-2 mt-1">
                <div className="flex justify-between gap-2"><span className="text-slate-500">RSI</span><span className={ta.rsi > 60 ? 'text-emerald-400' : ta.rsi < 40 ? 'text-red-400' : 'text-yellow-400'}>{ta.rsi.toFixed(1)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ADX</span><span className="text-blue-400">{ta.adx.toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Trend</span><span className={ta.supertrend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'}>{ta.supertrend.direction.toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Momentum</span><span className={ta.macd.histogram > 0 ? 'text-emerald-400' : 'text-red-400'}>{ta.macd.histogram > 0 ? 'Bullish' : 'Bearish'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Volatility</span><span className={ta.bollinger.width > 8 ? 'text-red-400' : 'text-slate-300'}>{ta.bollinger.width.toFixed(1)}%</span></div>
                {patternSignal && patternSignal.patterns.length === 0 && (
                  <div className="text-slate-600 pt-1">No candlestick patterns detected</div>
                )}
                <div className="text-slate-600 mt-1 text-[6px]">
                  Confidence: <span className="text-white">{patternSignal?.netConfidence || ta ? Math.round(Math.min(ta.adx * 1.5 + 20, 85)) : 0}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI View bar */}
        {ta && ta.rsi > 50 && ta.adx > 25 && (
          <div className="absolute bottom-10 sm:bottom-12 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-lg bg-yellow-500/10 backdrop-blur-md border border-yellow-500/30 rounded-lg px-3 py-1.5 text-[8px] sm:text-[9px] font-mono text-yellow-400 pointer-events-none z-10 flex flex-wrap items-center justify-center gap-2 text-center">
            <span>🤖</span>
            <span>AI View: {ta.supertrend.direction === 'up' ? 'Bullish' : 'Bearish'} — RSI {ta.rsi.toFixed(0)}, ADX {ta.adx.toFixed(0)}</span>
            {patternSignal && patternSignal.patterns.length > 0 && (
              <span className="text-emerald-400">| {patternSignal.primaryPattern?.name} ({patternSignal.netConfidence}%)</span>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 right-2 sm:right-auto flex flex-wrap items-center gap-2 sm:gap-3 text-[7px] font-mono pointer-events-none z-10 max-sm:opacity-90">
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-blue-500" /> MA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-purple-500" /> MA50</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-cyan-500/40" /> BB</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-emerald-500/40" /> Sup</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-red-500/40" /> Res</span>
        </div>
      </div>
    </div>
  );
}
