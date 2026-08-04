'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDIAN_EQUITY_TICKERS, INDIAN_UNIVERSE_LABEL, getTickerName, isIndianTicker } from '@/lib/marketConfig';
import { hasQuoteData, normalizeStocksMap } from '@/lib/quoteDisplay';
import { getFeedStatusDisplay } from '@/lib/feedStatus';
import { TerminalIcon } from '@/components/icons/TerminalIcons';

export default function StockMarketList() {
  const { stocks, connectionStatus, pricesStreaming, market } = useMarketData();
  const normalizedStocks = useMemo(() => normalizeStocksMap(stocks), [stocks]);
  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'ticker' | 'changePercent' | 'price'>('changePercent');
  const [trendingTickers, setTrendingTickers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/sentiment?action=trending', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.trending) setTrendingTickers(new Set(data.trending));
      })
      .catch(() => {});
    const refresh = setInterval(() => {
      fetch('/api/sentiment?action=trending', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.trending) setTrendingTickers(new Set(data.trending)); })
        .catch(() => {});
    }, 10 * 60 * 1000); 
    return () => clearInterval(refresh);
  }, []);

  const stockList = useMemo(() => {
    const entries: { ticker: string; market: 'INDIAN' }[] = [];
    const seen = new Set<string>();

    for (const t of INDIAN_EQUITY_TICKERS) {
      if (!seen.has(t)) { entries.push({ ticker: t, market: 'INDIAN' }); seen.add(t); }
    }
    
    for (const t of Object.keys(stocks)) {
      if (!seen.has(t) && !t.startsWith('^') && isIndianTicker(t)) {
        entries.push({ ticker: t, market: 'INDIAN' });
        seen.add(t);
      }
    }
    
    return entries;
  }, [stocks]);

  const q = search.trim().toLowerCase();
  const filterFn = (s: { ticker: string }) => {
    if (!q) return true;
    const name = (normalizedStocks[s.ticker]?.name || getTickerName(s.ticker)).toLowerCase();
    return s.ticker.toLowerCase().includes(q) || name.includes(q);
  };

  const sortFn = (a: { ticker: string }, b: { ticker: string }) => {
    const sa = normalizedStocks[a.ticker]; const sb = normalizedStocks[b.ticker];
    const aReady = hasQuoteData(sa);
    const bReady = hasQuoteData(sb);
    if (!aReady && !bReady) return a.ticker.localeCompare(b.ticker);
    if (!aReady) return 1;
    if (!bReady) return -1;
    if (sortBy === 'ticker') return a.ticker.localeCompare(b.ticker);
    if (sortBy === 'price') return sb!.price - sa!.price;
    return Math.abs(sb!.changePercent) - Math.abs(sa!.changePercent);
  };

  const renderRow = (ticker: string) => {
    const s = normalizedStocks[ticker];
    const ready = hasQuoteData(s);
    const name = s?.name || getTickerName(ticker);
    
    if (!ready) {
      return (
        <div key={ticker} className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-7 gap-2 px-2 sm:px-4 py-2 sm:py-2.5 items-center hover:bg-slate-800/20 border-b border-slate-800/10 opacity-40">
          <div className="col-span-2 flex flex-col justify-center">
            <div className="font-bold text-white text-[8px] sm:text-[10px] uppercase truncate">{ticker}</div>
            <div className="text-[7px] sm:text-[9px] text-slate-500 truncate">{name}</div>
          </div>
          <div className="col-span-2 sm:col-span-1 text-slate-600 text-xs text-right">--</div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-4 text-[7px] sm:text-[9px] text-slate-600 flex items-center justify-end sm:justify-start gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 animate-pulse"></span>
            Awaiting Market Data
          </div>
        </div>
      );
    }

    const price = s.price;
    const cVal = s.change;
    const cpVal = s.changePercent;

    const isUp = s!.change > 0;
    const isDown = s!.change < 0;
    const colorClass = isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-slate-400';
    const bgClass = isUp ? 'bg-emerald-950/10' : isDown ? 'bg-red-950/10' : 'bg-transparent';

    return (
      <div key={ticker} className={`grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-7 gap-2 px-2 sm:px-4 py-2 sm:py-2.5 items-center hover:bg-slate-800/20 border-b border-slate-800/10 ${bgClass} transition-colors`}>
        <div className="col-span-2 flex flex-col justify-center">
          <div className="font-bold text-white text-[8px] sm:text-[10px] flex items-center gap-1.5 truncate">
            <span className={`text-[6px] sm:text-[7px] px-1 py-0.5 rounded font-bold text-orange-400 bg-orange-950 border border-orange-800/30`}>IN</span>
            {ticker}
          </div>
          <div className="text-[7px] sm:text-[9px] text-slate-400 truncate mt-0.5" title={name}>{name}</div>
        </div>
        
        <div className="col-span-2 sm:col-span-1 text-right text-xs sm:text-sm font-mono text-white font-medium">
          ₹{price}
        </div>
        
        <div className={`col-span-2 sm:col-span-1 text-right text-[8px] sm:text-[10px] font-mono font-bold ${colorClass}`}>
          {isUp ? '+' : ''}{cVal}
        </div>
        
        <div className={`col-span-2 sm:col-span-1 text-right text-[8px] sm:text-[10px] font-mono font-bold ${colorClass}`}>
          {isUp ? '+' : ''}{cpVal}%
        </div>
        
        <div className="col-span-1 text-right text-slate-500 truncate text-[7px] sm:text-[10px] hidden lg:block">NSE</div>
      </div>
    );
  };

  const searching = q.length > 0;
  const filteredList = stockList.filter(filterFn).sort(sortFn);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <TerminalIcon name="list" size={20} className="text-emerald-400 shrink-0" />
            Indian Market Stock List
          </h2>
          <p className="text-[9px] text-slate-500 font-mono">
            {INDIAN_UNIVERSE_LABEL} + AI discovered — Yahoo Finance live / last close
            {connectionStatus === 'disconnected' && <span className="text-red-400 ml-2">⚠️ No connection — data frozen</span>}
          </p>
        </div>
          <div className="flex items-center gap-2">
          <input id="stock-list-search" name="stockSearch" type="search" placeholder={`Search ${filteredList.length} stocks…`} value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-[8px] sm:text-[10px] font-mono text-white placeholder-slate-600 w-28 sm:w-48 outline-none focus:border-emerald-500/50 transition-colors" />
          <select id="stock-list-sort" name="stockSort" value={sortBy} onChange={e => setSortBy(e.target.value as 'ticker' | 'changePercent' | 'price')}
            className="bg-slate-950 border border-slate-800 rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 text-[8px] sm:text-[9px] font-mono text-slate-400 outline-none focus:border-emerald-500/50">
            <option value="changePercent">Sort: Move</option>
            <option value="ticker">Sort: Ticker</option>
            <option value="price">Sort: Price</option>
          </select>
        </div>
      </div>

      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse-glow" />
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <TerminalIcon name="india" size={16} className="text-orange-400" />
              Indian Stocks — NSE/BSE
            </h3>
          </div>
          <span className="text-[8px] text-slate-600 font-mono flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${feed.dotClass}`} /> {feed.label}
          </span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-1 sm:p-2">
          <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[350px] sm:min-w-0">
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-7 gap-2 px-2 sm:px-4 py-2 text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase tracking-wider font-mono border-b border-slate-800/50">
            <span className="col-span-2">Ticker</span>
            <span className="col-span-2 sm:col-span-1 text-right">Price</span>
            <span className="col-span-2 sm:col-span-1 text-right">Change</span>
            <span className="col-span-2 sm:col-span-1 text-right">%</span>
            <span className="col-span-1 text-right hidden lg:block">Market</span>
          </div>
          <div className="max-h-[320px] sm:max-h-[420px] overflow-y-auto custom-scrollbar">
            {filteredList.slice(0, 100).map(s => renderRow(s.ticker))}
            {filteredList.length === 0 && (
              <div className="text-center py-8 font-mono">
                <div className="text-[10px] text-slate-500">No match for "{search}"</div>
              </div>
            )}
          </div>
          </div>
          </div>
        </div>
      </div>




    </div>
  );
}