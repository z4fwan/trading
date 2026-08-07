'use client';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { type OHLC } from '@/lib/technicalAnalysis';
import { INDIAN_EQUITY_TICKERS, INDEX_TICKERS, normalizeTicker, tickerToYahoo } from '@/lib/marketConfig';
import { normalizeStocksMap } from '@/lib/quoteDisplay';
import { shouldSaveBandwidth } from '@/lib/renderBandwidth';
import type { MarketSummary } from '@/lib/exchangeHours';
import { getMarketSummary, STATIC_MARKET_PLACEHOLDER } from '@/lib/exchangeHours';
import { isSymbolFrozen } from '@/lib/exchangeHours';

const PRICE_EPS_RATIO = 0.00005;

/**
 * True only when a price/change difference is economically meaningful. Yahoo
 * returns float noise between polls (e.g. 734.3000000001 vs 734.2999999); an
 * exact `a !== b` compare counts that noise as a real tick, which inflates the
 * momentum counter and forces a full re-render on every poll (the "fake
 * momentum / constant refreshing" flicker guests see). Sub-tick jitter below
 * one paisa (or 0.005% of magnitude for larger values) is ignored. Handles
 * negative values (e.g. a falling stock's change) correctly.
 */
function priceMoved(a: number, b: number, streaming = false): boolean {
  if (a === b) return false;
  if (a === 0 || b === 0) return true;
  const mag = Math.max(Math.abs(a), Math.abs(b));
  const eps = Math.max(0.01, mag * 0.00005);
  return Math.abs(a - b) > eps;
}

export interface QuoteData {
  price: number; change: number; changePercent: number; high: number; low: number;
  open: number; prevClose: number; volume: number; bid: number; ask: number;
  marketCap?: number; pe?: number; dividendYield?: number;
  name: string; timestamp: number;
  priceSource?: string;
}

interface QuoteResponse {
  price: number; change?: number; changePercent?: number; high?: number; low?: number;
  open?: number; prevClose?: number; volume?: number; bid?: number; ask?: number;
  marketCap?: number; pe?: number; dividendYield?: number; name?: string;
  priceSource?: string;
  frozen?: boolean;
}

interface ApiQuotesPayload {
  stocks?: Record<string, QuoteResponse>;
  indices?: Record<string, QuoteResponse>;
  timestamp?: number;
  market?: MarketSummary;
  error?: string;
}

export type ConnectionStatus = 'live' | 'stale' | 'disconnected';

interface MarketContextValue {
  stocks: Record<string, QuoteData>;
  indices: Record<string, QuoteData>;
  getStock: (ticker: string) => QuoteData | undefined;
  getIndex: (symbol: string) => QuoteData | undefined;
  getHistory: (ticker: string) => OHLC[] | undefined;
  fetchHistory: (ticker: string) => Promise<OHLC[] | undefined>;
  fetchHistoryBatch: (tickers: string[]) => Promise<void>;
  getSessionHL: (ticker: string) => { high: number; low: number } | undefined;
  isLive: boolean;
  /** True when exchanges can print new trades (not weekend/off-hours freeze). */
  pricesStreaming: boolean;
  connectionStatus: ConnectionStatus;
  historyLoading: boolean;
  market: MarketSummary;
  lastFetchAt: number;
  dataVersion: number;
  priceChangeCount: number;
  /** Increments every successful poll (even if prices unchanged) — drives LIVE UI pulse */
  feedPulse: number;
  engineState: any;
  /** Live realtime AI predictions pushed over the /ws socket. */
  alerts: any[];
}

const MarketContext = createContext<MarketContextValue>({
  stocks: {}, indices: {}, getStock: () => undefined, getIndex: () => undefined,
  getHistory: () => undefined, fetchHistory: async () => undefined, fetchHistoryBatch: async () => undefined, getSessionHL: () => undefined, isLive: false, pricesStreaming: false,
  connectionStatus: 'disconnected', historyLoading: true, market: STATIC_MARKET_PLACEHOLDER,
  lastFetchAt: 0, dataVersion: 0, priceChangeCount: 0, feedPulse: 0, engineState: null, alerts: [],
});

export function useMarketData() {
  return useContext(MarketContext);
}

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const [stocks, setStocks] = useState<Record<string, QuoteData>>({});
  const [indices, setIndices] = useState<Record<string, QuoteData>>({});
  const [isLive, setIsLive] = useState(false);
  const [pricesStreaming, setPricesStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [historyCache, setHistoryCache] = useState<Record<string, OHLC[]>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [market, setMarket] = useState<MarketSummary>(STATIC_MARKET_PLACEHOLDER);
  const [engineState, setEngineState] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    setMarket(getMarketSummary());
  }, []);
  const [lastFetchAt, setLastFetchAt] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [priceChangeCount, setPriceChangeCount] = useState(0);
  const [feedPulse, setFeedPulse] = useState(0);

  const sessionHL = useRef<Record<string, { high: number; low: number; open: number; day: string }>>({});
  const failCount = useRef(0);
  const historyFetched = useRef(false);
  const reconnectAttempts = useRef(0);
  const prevPrices = useRef<Record<string, number>>({});
  const lastReal = useRef<Record<string, { price: number; prevClose: number }>>({});

  useEffect(() => {
    if (historyFetched.current) return;
    historyFetched.current = true;
    const priority = [
      '^NSEI', '^BSESN', '^GSPC', '^IXIC', '^NSEBANK',
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    ];
    const cached = {} as Record<string, OHLC[]>;

    (async () => {
      const yahooSymbols = priority.map(t => normalizeTicker(t)).filter(Boolean);
      try {
        const res = await fetch(`/api/history/batch?symbols=${yahooSymbols.join(',')}&interval=1d`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          for (const [sym, result] of Object.entries(data.results as Record<string, { candles: OHLC[] }>)) {
            const ticker = normalizeTicker(sym);
            if (result.candles && result.candles.length > 1) {
              cached[ticker] = result.candles;
            }
          }
          if (Object.keys(cached).length > 0) setHistoryCache(prev => ({ ...prev, ...cached }));
        }
      } catch { /* non-fatal */ }
      setHistoryLoading(false);
    })();
  }, []);

  const applyPayload = useCallback((data: ApiQuotesPayload) => {
    const serverTs = data.timestamp || Date.now();
    const newStocks: Record<string, QuoteData> = {};
    const newIndices: Record<string, QuoteData> = {};
    const today = new Date().toISOString().split('T')[0];
    const mktEarly = data.market || getMarketSummary();
    const streaming = mktEarly.priceTicksExpected;
    let changes = 0;

    for (const [yahooSym, info] of Object.entries(data.stocks || {})) {
      const ticker = normalizeTicker(yahooSym);
      if (!info || typeof info.price !== 'number') continue;

      const priorGood = lastReal.current[ticker]?.price || 0;
      const prevClose = info.prevClose || priorGood || 0;
      const effectivePrice = info.price > 0 ? info.price : (prevClose > 0 ? prevClose : 0);
      if (effectivePrice < 0) continue;

      const frozen = info.frozen ?? isSymbolFrozen(yahooSym, mktEarly);
      const prev = prevPrices.current[ticker];
      if (prev !== undefined && priceMoved(prev, effectivePrice, streaming)) changes++;

      const apiHigh = info.high ?? effectivePrice;
      const apiLow = info.low ?? effectivePrice;
      const changeVal = info.change ?? 0;
      const changePctVal = info.changePercent ?? 0;
      newStocks[ticker] = {
        price: effectivePrice,
        change: changeVal,
        changePercent: changePctVal,
        high: frozen ? apiHigh : Math.max(sessionHL.current[ticker]?.high || 0, apiHigh, effectivePrice),
        low: frozen ? apiLow : (sessionHL.current[ticker]?.low
          ? Math.min(sessionHL.current[ticker].low, apiLow, effectivePrice)
          : Math.min(apiLow, effectivePrice)),
        open: info.open ?? effectivePrice,
        prevClose,
        volume: info.volume ?? 0,
        bid: info.bid && info.bid > 0 ? info.bid : 0,
        ask: info.ask && info.ask > 0 ? info.ask : 0,
        marketCap: info.marketCap,
        pe: info.pe ?? undefined,
        dividendYield: info.dividendYield,
        name: info.name || ticker,
        timestamp: serverTs,
        priceSource: info.priceSource,
      };
      prevPrices.current[ticker] = effectivePrice;
      if (effectivePrice > 0) lastReal.current[ticker] = { price: effectivePrice, prevClose };

      if (!frozen) {
        if (!sessionHL.current[ticker] || sessionHL.current[ticker].day !== today) {
          sessionHL.current[ticker] = { high: newStocks[ticker].high, low: newStocks[ticker].low, open: newStocks[ticker].open, day: today };
        } else {
          sessionHL.current[ticker].high = Math.max(sessionHL.current[ticker].high, newStocks[ticker].high, effectivePrice);
          sessionHL.current[ticker].low = Math.min(sessionHL.current[ticker].low, newStocks[ticker].low, effectivePrice);
        }
      }
    }

    for (const [yahooSym, info] of Object.entries(data.indices || {})) {
      if (!info || typeof info.price !== 'number' || info.price <= 0) continue;
      const key = yahooSym;
      const frozenIdx = info.frozen ?? isSymbolFrozen(yahooSym, mktEarly);
      const prev = prevPrices.current[key];
      if (prev !== undefined && priceMoved(prev, info.price, streaming)) changes++;
      if (frozenIdx && prev !== undefined && !priceMoved(prev, info.price)) continue;
      newIndices[key] = {
        price: info.price, change: info.change || 0, changePercent: info.changePercent || 0,
        high: info.high || info.price, low: info.low || info.price,
        open: info.open || info.price, prevClose: info.prevClose || info.price,
        volume: info.volume || 0, bid: 0, ask: 0,
        name: INDEX_TICKERS[yahooSym] || yahooSym, timestamp: serverTs,
        priceSource: info.priceSource,
      };
      prevPrices.current[key] = info.price;
      if (info.price > 0) lastReal.current[key] = { price: info.price, prevClose: info.prevClose || info.price };
    }

    // If the API returned zero for ALL stocks (geo-restricted), rebuild from lastReal
    if (Object.keys(newStocks).length === 0 && Object.keys(lastReal.current).length > 0) {
      for (const [ticker, real] of Object.entries(lastReal.current)) {
        if (ticker.startsWith('^')) continue;
        if (newStocks[ticker]) continue;
        newStocks[ticker] = {
          price: real.price, change: 0, changePercent: 0,
          high: real.price, low: real.price, open: real.price, prevClose: real.prevClose,
          volume: 0, bid: real.price, ask: real.price,
          name: ticker, timestamp: serverTs, priceSource: 'lastReal',
        };
      }
    }

    const mkt = data.market || getMarketSummary();
    if (Object.keys(newStocks).length > 0) {
      setStocks(prev => {
        const merged = normalizeStocksMap(prev);
        let anyChanged = false;
        for (const [ticker, row] of Object.entries(newStocks)) {
          const prevRow = merged[ticker];
          if (prevRow && row.priceSource === 'sticky-cache') {
            merged[ticker] = { ...prevRow, timestamp: row.timestamp };
            anyChanged = true;
            continue;
          }
          const sym = normalizeTicker(ticker);
          const rowFrozen = isSymbolFrozen(sym, mkt);
          if (prevRow && rowFrozen && !priceMoved(prevRow.price, row.price)) {
            if (!prevRow.timestamp || row.timestamp - prevRow.timestamp > 5000) {
              merged[ticker] = { ...prevRow, timestamp: row.timestamp };
              anyChanged = true;
            }
            continue;
          }
          if (prevRow && !priceMoved(prevRow.price, row.price) && !priceMoved(prevRow.change, row.change)) {
            if (!prevRow.timestamp || row.timestamp - prevRow.timestamp > 5000) {
              merged[ticker] = { ...prevRow, timestamp: row.timestamp, priceSource: row.priceSource };
              anyChanged = true;
            }
            continue;
          }
          merged[ticker] = row;
          anyChanged = true;
        }
        if (!anyChanged) return prev;
        return merged;
      });
    }
    if (Object.keys(newIndices).length > 0) {
      setIndices(prev => ({ ...prev, ...newIndices }));
    }
    setMarket(mkt);

    setLastFetchAt(serverTs);
    setFeedPulse(p => p + 1);
    if (changes > 0) {
      setDataVersion(v => v + 1);
      setPriceChangeCount(c => c + changes);
    }
    setPricesStreaming(mkt.priceTicksExpected);
    const hasQuotes =
      Object.keys(newStocks).length > 0 || Object.keys(newIndices).length > 0;
    if (hasQuotes) {
      setIsLive(true);
      setConnectionStatus('live');
      failCount.current = 0;
      reconnectAttempts.current = 0;
    } else if (Object.keys(lastReal.current).length > 0) {
      setIsLive(false);
      setConnectionStatus('stale');
    } else {
      setIsLive(false);
      setConnectionStatus('stale');
      failCount.current = Math.min(failCount.current + 1, 10);
    }
  }, []);

  const fetchQuotes = useCallback(async (prefetchedData?: ApiQuotesPayload) => {
    try {
      const data = prefetchedData || await (async () => {
        const lite = shouldSaveBandwidth() ? '&lite=1' : '';
        const res = await fetch(`/api/quotes?_=${Date.now()}${lite}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d: ApiQuotesPayload = await res.json();
        if (d.error) throw new Error(d.error);
        return d;
      })();
      applyPayload(data);
    } catch {
      failCount.current++;
      if (failCount.current >= 3) {
        setIsLive(false);
        setConnectionStatus('disconnected');
      } else {
        setConnectionStatus('stale');
      }
    }
  }, [applyPayload]);

  // Track WS connection status to avoid double-fetching
  const wsConnected = useRef(false);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval>;
    const bandwidthSaver = shouldSaveBandwidth();
    const pollMs = () => {
      const hidden = document.hidden;
      if (bandwidthSaver) return hidden ? 15000 : 8000;
      return hidden ? 10000 : 5000;
    };
    const schedulePoll = () => {
      clearInterval(pollTimer);
      if (wsConnected.current) {
        // WS is active. Only run a very slow safety-net poll in case the connection silently hung.
        pollTimer = setInterval(() => {
          if (Date.now() - lastFetchAt > 20000) fetchQuotes();
        }, pollMs());
        return;
      }
      // WS is disconnected, fallback to aggressive REST polling
      const hidden = document.hidden;
      if (bandwidthSaver) {
        pollTimer = setInterval(() => fetchQuotes(), hidden ? 5000 : (getMarketSummary().priceTicksExpected ? 1500 : 3000));
      } else {
        pollTimer = setInterval(() => fetchQuotes(), hidden ? 2000 : (getMarketSummary().priceTicksExpected ? 800 : 1500));
      }
    };
    fetchQuotes();
    schedulePoll();
    const marketTimer = setInterval(() => {
      setMarket(getMarketSummary());
      schedulePoll();
    }, 5000);
    const onVisChange = () => schedulePoll();
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      clearInterval(pollTimer);
      clearInterval(marketTimer);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [fetchQuotes, lastFetchAt]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let wsRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    function connectWS() {
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${location.host}/ws`);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'quote' && msg.data) {
              applyPayload(typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data);
            } else if (msg.type === 'engine_state' && msg.data) {
              setEngineState(typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data);
            } else if (msg.type === 'alert' && msg.data) {
              setAlerts(prev => [msg.data, ...prev].slice(0, 50));
            }
          } catch { /* parse error */ }
        };
        ws.onopen = () => { 
          wsConnected.current = true; 
          reconnectAttempts = 0;
        };
        ws.onclose = () => {
          wsConnected.current = false;
          ws = null;
          const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
          reconnectAttempts++;
          wsRetryTimer = setTimeout(connectWS, delay);
        };
        ws.onerror = () => { ws?.close(); };
      } catch { /* WS unavailable */ }
    }

    connectWS();
    return () => {
      wsConnected.current = false;
      ws?.close();
      if (wsRetryTimer) clearTimeout(wsRetryTimer);
    };
  }, [applyPayload]);

  const getStock = useCallback((ticker: string) => stocks[ticker], [stocks]);
  const getIndex = useCallback((symbol: string) => indices[symbol], [indices]);
  const getHistory = useCallback((ticker: string) => historyCache[ticker], [historyCache]);

  const fetchHistory = useCallback(async (ticker: string): Promise<OHLC[] | undefined> => {
    if (historyCache[ticker]) return historyCache[ticker];
    const yahooSym = tickerToYahoo(ticker);
    if (!yahooSym) return undefined;
    try {
      const res = await fetch(`/api/history?symbol=${encodeURIComponent(yahooSym)}`, { cache: 'no-store' });
      if (!res.ok) return undefined;
      const data = await res.json();
      if (data.candles && data.candles.length > 1) {
        setHistoryCache(prev => ({ ...prev, [ticker]: data.candles }));
        return data.candles;
      }
    } catch { /* non-fatal */ }
    return undefined;
  }, [historyCache]);

  const fetchHistoryBatch = useCallback(async (tickers: string[]): Promise<void> => {
    const missing = tickers.filter(t => !historyCache[t]);
    if (missing.length === 0) return;
    
    // Batch in chunks of 40 to avoid Yahoo finance limits
    for (let i = 0; i < missing.length; i += 40) {
      const chunk = missing.slice(i, i + 40);
      const yahooSymbols = chunk.map(t => tickerToYahoo(t)).filter(Boolean);
      try {
        const res = await fetch(`/api/history/batch?symbols=${yahooSymbols.join(',')}&interval=1d`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const newCache: Record<string, OHLC[]> = {};
          for (const [sym, result] of Object.entries(data.results as Record<string, { candles: OHLC[] }>)) {
            const t = normalizeTicker(sym);
            if (result.candles && result.candles.length > 1) {
              newCache[t] = result.candles;
            }
          }
          if (Object.keys(newCache).length > 0) {
            setHistoryCache(prev => ({ ...prev, ...newCache }));
          }
        }
      } catch { /* non-fatal */ }
    }
  }, [historyCache]);

  const getSessionHL = useCallback((ticker: string) => {
    const hl = sessionHL.current[ticker];
    return hl ? { high: hl.high, low: hl.low } : undefined;
  }, []);

  const contextValue = useMemo(() => ({
    stocks, indices, getStock, getIndex, getHistory, fetchHistory, fetchHistoryBatch, getSessionHL,
    isLive, pricesStreaming, connectionStatus, historyLoading, market, lastFetchAt, dataVersion, priceChangeCount, feedPulse,
    engineState, alerts,
  }), [
    stocks, indices, getStock, getIndex, getHistory, fetchHistory, fetchHistoryBatch, getSessionHL,
    isLive, pricesStreaming, connectionStatus, historyLoading, market, lastFetchAt, dataVersion, priceChangeCount, feedPulse, engineState, alerts,
  ]);

  return (
    <MarketContext.Provider value={contextValue}>
      {children}
    </MarketContext.Provider>
  );
}
