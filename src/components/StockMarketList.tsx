'use client';
import React, { useState, useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDIAN_EQUITY_TICKERS, INTERNATIONAL_TICKERS, INDIAN_UNIVERSE_LABEL, getTickerName, isIndianTicker } from '@/lib/marketConfig';
import { hasQuoteData, normalizeStocksMap } from '@/lib/quoteDisplay';
import { getFeedStatusDisplay } from '@/lib/feedStatus';
import { TerminalIcon } from '@/components/icons/TerminalIcons';
import SmoothPrice from '@/components/SmoothPrice';

export default function StockMarketList() {
  const { stocks, connectionStatus, pricesStreaming, market } = useMarketData();
  const normalizedStocks = useMemo(() => normalizeStocksMap(stocks), [stocks]);
  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'ticker' | 'changePercent' | 'price'>('changePercent');

  // Build list of all stocks: Nifty 500 + International + AI-discovered
  const allEntries = useMemo(() => {
    const entries: { ticker: string; market: 'INDIAN' | 'INTERNATIONAL' }[] = [];
    const seen = new Set<string>();

    for (const t of INDIAN_EQUITY_TICKERS) {
      entries.push({ ticker: t, market: 'INDIAN' });
      seen.add(t);
    }
    for (const t of INTERNATIONAL_TICKERS) {
      entries.push({ ticker: t, market: 'INTERNATIONAL' });
      seen.add(t);
    }
    
    // Add dynamic tickers discovered by AI engine
    for (const t of Object.keys(stocks)) {
      if (!seen.has(t) && !t.startsWith('^')) {
        const marketType = isIndianTicker(t) ? 'INDIAN' : 'INTERNATIONAL';
        entries.push({ ticker: t, market: marketType });
        seen.add(t);
      }
    }
    
    return entries;
  }, [stocks]);

  const indianLoaded = useMemo(
    () => allEntries.filter(e => e.market === 'INDIAN' && hasQuoteData(normalizedStocks[e.ticker])).length,
    [normalizedStocks, allEntries],
  );

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

  const renderRow = (ticker: string, market: 'INDIAN' | 'INTERNATIONAL') => {
    const s = normalizedStocks[ticker];
    const ready = hasQuoteData(s);
    const currency = market === 'INDIAN' ? '₹' : '$';
    const displayName = s?.name || getTickerName(ticker);
    return (
      <div key={ticker} className={`grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-8 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-mono items-center px-1.5 sm:px-3 py-1.5 sm:py-2.5 rounded-lg hover:bg-slate-800/30 ${
        !ready ? 'bg-slate-950/40 opacity-70' : s!.change >= 0 ? 'bg-emerald-950/5' : 'bg-red-950/5'
      }`}>
        <div className="col-span-1 font-bold text-white text-[9px] sm:text-[10px]">{ticker}</div>
        <div className="col-span-2 text-slate-400 truncate text-[7px] sm:text-[10px]" title={displayName}>{displayName}</div>
        {ready ? (
          <>
            <div className="col-span-1 text-right font-bold text-white text-[9px] sm:text-[10px]">
              <SmoothPrice value={s!.price} decimals={2} prefix={currency} />
            </div>
            <div className={`col-span-1 text-right font-bold price-change ${s!.change >= 0 ? 'text-emerald-400' : 'text-red-400'} text-[9px] sm:text-[10px]`}>
              {s!.change >= 0 ? '+' : ''}{s!.change.toFixed(2)}
            </div>
            <div className={`col-span-1 text-right font-bold price-change ${s!.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'} text-[9px] sm:text-[10px]`}>
              {s!.changePercent >= 0 ? '+' : ''}{s!.changePercent.toFixed(2)}%
            </div>
            <div className="col-span-1 text-right text-slate-500 text-[7px] sm:text-[10px] hidden sm:block">{currency}{(s!.low || s!.price).toFixed(0)}/{currency}{(s!.high || s!.price).toFixed(0)}</div>
          </>
        ) : (
          <>
            <div className="col-span-3 text-right text-slate-500 text-[8px] sm:text-[9px] animate-pulse">Fetching quote…</div>
            <div className="col-span-1 text-right text-slate-600 hidden sm:block">—</div>
          </>
        )}
        <div className="col-span-1 text-right text-slate-500 truncate text-[7px] sm:text-[10px] hidden lg:block">{market === 'INDIAN' ? 'NSE' : 'NYSE'}</div>
      </div>
    );
  };

  const searching = q.length > 0;
  const indianEntries = allEntries.filter(e => e.market === 'INDIAN').filter(filterFn).sort(sortFn);
  const intlEntries = allEntries.filter(e => e.market === 'INTERNATIONAL').filter(filterFn).sort(sortFn);

  const indianWithPrice = allEntries.filter(e => e.market === 'INDIAN' && hasQuoteData(normalizedStocks[e.ticker]));
  const indianUp = indianWithPrice.filter(e => (normalizedStocks[e.ticker]?.change || 0) > 0).length;
  const indianDown = indianWithPrice.filter(e => (normalizedStocks[e.ticker]?.change || 0) < 0).length;
  const intlUp = allEntries.filter(e => e.market === 'INTERNATIONAL' && (normalizedStocks[e.ticker]?.change || 0) > 0).length;
  const intlDown = allEntries.filter(e => e.market === 'INTERNATIONAL' && (normalizedStocks[e.ticker]?.change || 0) < 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <TerminalIcon name="list" size={20} className="text-emerald-400 shrink-0" />
            Full Market Stock Lists
          </h2>
          <p className="text-[9px] text-slate-500 font-mono">
            {INDIAN_UNIVERSE_LABEL} + US watchlist + AI discovered — Yahoo Finance live / last close
            {connectionStatus === 'disconnected' && <span className="text-red-400 ml-2">⚠️ No connection — data frozen</span>}
            {connectionStatus === 'stale' && <span className="text-yellow-500 ml-2">≈ stale</span>}
          </p>
        </div>
          <div className="flex items-center gap-2">
          <input id="stock-list-search" name="stockSearch" type="search" placeholder={`Search ${indianEntries.length} stocks…`} value={search}
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
            <span className="text-[9px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
              {searching ? `${indianEntries.length} matches` : `${indianLoaded} / ${indianEntries.length} live`}
            </span>
          </div>
          <span className="text-[8px] text-slate-600 font-mono flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${feed.dotClass}`} /> {feed.label}
          </span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-1 sm:p-2">
          <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[350px] sm:min-w-0">
          <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-8 gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase tracking-wider font-mono border-b border-slate-800/50">
            <span className="col-span-1">Ticker</span>
            <span className="col-span-2">Name</span>
            <span className="col-span-1 text-right">Price</span>
            <span className="col-span-1 text-right">Change</span>
            <span className="col-span-1 text-right">%</span>
            <span className="col-span-1 text-right hidden sm:block">Range</span>
            <span className="col-span-1 text-right hidden lg:block">Sector</span>
          </div>
          <div className="max-h-[320px] sm:max-h-[420px] overflow-y-auto custom-scrollbar">
            {indianEntries.map(e => renderRow(e.ticker, e.market))}
            {indianEntries.length === 0 && searching && (
              <div className="text-center py-8 font-mono">
                <div className="text-[10px] text-slate-500">No match for "{search}" in Nifty 500</div>
              </div>
            )}
          </div>
          </div>
          </div>
        </div>
      </div>

      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-3 sm:p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse-glow" />
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <TerminalIcon name="globe" size={16} className="text-blue-400" />
              International Stocks — S&P / NYSE / NASDAQ
            </h3>
            <span className="text-[9px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">{intlEntries.length} stocks</span>
          </div>
          <span className="text-[8px] text-slate-600 font-mono flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${feed.dotClass}`} /> {feed.label}
          </span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-1 sm:p-2">
          <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[350px] sm:min-w-0">
          <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-8 gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase tracking-wider font-mono border-b border-slate-800/50">
            <span className="col-span-1">Ticker</span>
            <span className="col-span-2">Name</span>
            <span className="col-span-1 text-right">Price</span>
            <span className="col-span-1 text-right">Change</span>
            <span className="col-span-1 text-right">%</span>
            <span className="col-span-1 text-right hidden sm:block">Range</span>
            <span className="col-span-1 text-right hidden lg:block">Sector</span>
          </div>
          <div className="max-h-[320px] sm:max-h-[420px] overflow-y-auto custom-scrollbar">
            {intlEntries.map(e => renderRow(e.ticker, e.market))}
            {intlEntries.length === 0 && searching && (
              <div className="text-center text-[10px] text-slate-500 py-8 font-mono">No international matches</div>
            )}
          </div>
          </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Indian Advancers', value: indianUp, total: indianWithPrice.length, color: 'text-emerald-400' },
          { label: 'Indian Decliners', value: indianDown, total: indianWithPrice.length, color: 'text-red-400' },
          { label: 'Intl Advancers', value: intlUp, total: allEntries.filter(e => e.market === 'INTERNATIONAL').length, color: 'text-emerald-400' },
          { label: 'Intl Decliners', value: intlDown, total: allEntries.filter(e => e.market === 'INTERNATIONAL').length, color: 'text-red-400' },
        ].map((item, i) => (
          <div key={i} className="border border-slate-800 bg-slate-900/10 rounded-xl p-3 text-center">
            <div className="text-[8px] text-slate-500 uppercase font-mono font-bold">{item.label}</div>
            <div className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</div>
            <div className="text-[9px] text-slate-600 font-mono">of {item.total}</div>
          </div>
        ))}
      </div>
    </div>
  );
}