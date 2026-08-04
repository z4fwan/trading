'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDIAN_UNIVERSE_LABEL } from '@/lib/marketConfig';
import { ALL_LISTED_TICKERS, hasQuoteData, normalizeStocksMap, quoteDisplayPrice } from '@/lib/quoteDisplay';
import { TerminalIcon } from '@/components/icons/TerminalIcons';
import SmoothPrice from '@/components/SmoothPrice';
import { getFeedStatusDisplay } from '@/lib/feedStatus';

export default function LiveMarketPrices() {
  const { stocks, connectionStatus, market, lastFetchAt, feedPulse, pricesStreaming } = useMarketData();
  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);
  const connected = connectionStatus !== 'disconnected';
  const [filterMarket, setFilterMarket] = useState<'ALL' | 'INDIAN'>('ALL');
  const [sortBy, setSortBy] = useState<'changePercent' | 'volume' | 'price' | 'change'>('changePercent');
  const [pollAgeSec, setPollAgeSec] = useState(0);

  const normalizedStocks = useMemo(() => normalizeStocksMap(stocks), [stocks]);

  useEffect(() => {
    const tick = () => {
      setPollAgeSec(lastFetchAt ? Math.max(0, Math.round((Date.now() - lastFetchAt) / 1000)) : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastFetchAt]);

  const allStocks = useMemo(() => {
    return ALL_LISTED_TICKERS.map(({ ticker, market: mkt }) => {
      const data = normalizedStocks[ticker];
      return { ticker, data, market: mkt, ready: hasQuoteData(data) };
    });
  }, [normalizedStocks]);

  const filtered = useMemo(() => {
    return allStocks
      .filter(s => filterMarket === 'ALL' || s.market === filterMarket)
      .filter(s => s.ready)
      .sort((a, b) => {
        const sa = a.data!;
        const sb = b.data!;
        if (sortBy === 'volume') return sb.volume - sa.volume;
        if (sortBy === 'price') return quoteDisplayPrice(sb) - quoteDisplayPrice(sa);
        if (sortBy === 'change') return Math.abs(sb.change) - Math.abs(sa.change);
        return Math.abs(sb.changePercent) - Math.abs(sa.changePercent);
      });
  }, [allStocks, filterMarket, sortBy]);

  const loadingRows = useMemo(
    () => allStocks.filter(s => (filterMarket === 'ALL' || s.market === filterMarket) && !s.ready),
    [allStocks, filterMarket],
  );

  const pricedIndian = allStocks.filter(s => s.market === 'INDIAN' && s.ready);
  const indianUp = pricedIndian.filter(s => s.data!.change > 0).length;
  const indianDown = pricedIndian.filter(s => s.data!.change < 0).length;

  const count = filtered.length;
  const totalListed = allStocks.filter(s => filterMarket === 'ALL' || s.market === filterMarket).length;

  const livePulse = connected && (pricesStreaming || Date.now() - lastFetchAt < 10000);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <TerminalIcon name="stocks" size={20} className="text-emerald-400 shrink-0" />
            Market Prices
            {livePulse ? (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 rt-pulse" />
                LIVE
              </span>
            ) : connectionStatus === 'disconnected' ? (
              <span className="text-[9px] font-bold text-red-400 bg-red-950/40 px-2 py-0.5 rounded-full border border-red-500/30">OFFLINE</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-full border border-slate-700/30">LAST CLOSE</span>
            )}
          </h2>
          <p className="text-[9px] text-slate-500 font-mono">
            {INDIAN_UNIVERSE_LABEL} · Live Exchange Feed
            {lastFetchAt > 0 && <span className="ml-1">· <span className="tabular-nums">{pollAgeSec}s</span> ago</span>}
            · feed <span className="tabular-nums text-slate-400 font-bold">#{feedPulse}</span>
            {connectionStatus === 'disconnected' && <span className="text-red-400 ml-2">⚠️ No connection</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {(['ALL', 'INDIAN'] as const).map(m => (
              <button
                key={m}
                onClick={() => setFilterMarket(m)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  filterMarket === m ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-800' : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {m === 'ALL' ? 'ALL' : 'NSE/BSE'}
              </button>
            ))}
          </div>
          <select id="live-prices-sort" name="livePricesSort" value={sortBy} onChange={e => setSortBy(e.target.value as 'changePercent' | 'volume' | 'price' | 'change')}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px] font-mono text-slate-400 outline-none focus:border-emerald-500/50">
            <option value="changePercent">Sort: Movement</option>
            <option value="change">Sort: Price Δ</option>
            <option value="volume">Sort: Volume</option>
            <option value="price">Sort: Price</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: 'IN Up', value: indianUp, color: 'text-emerald-400' },
          { label: 'IN Down', value: indianDown, color: 'text-red-400' },
        ].map((item, i) => (
          <div key={i} className="border border-slate-800 bg-slate-900/10 rounded-xl p-3 text-center">
            <div className="text-[8px] text-slate-500 uppercase font-mono font-bold">{item.label}</div>
            <div className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[400px] sm:min-w-0">
        <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-12 gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase tracking-wider font-mono border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
          <span className="col-span-1">Ticker</span>
          <span className="col-span-2 hidden sm:block">Name</span>
          <span className="col-span-1 text-right">Price</span>
          <span className="col-span-1 text-right">Change</span>
          <span className="col-span-1 text-right">%</span>
          <span className="col-span-1 text-right hidden lg:block">Bid</span>
          <span className="col-span-1 text-right hidden lg:block">Ask</span>
          <span className="col-span-1 text-right hidden sm:block">Range</span>
          <span className="col-span-1 text-right hidden lg:block">Vol</span>
          <span className="col-span-1 text-right hidden lg:block">P/E</span>
        </div>

        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
          {filtered.slice(0, 100).map(({ ticker, data: s, market: mkt }) => {
            const price = quoteDisplayPrice(s);
            const dayRange = s.high - s.low || 1;
            const posFromLow = ((price - s.low) / dayRange) * 100;
            const currency = '₹';
            return (
              <div key={ticker} className={`grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-12 gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 text-[8px] sm:text-[10px] font-mono items-center hover:bg-slate-800/20 border-b border-slate-800/20 ${
                s.change >= 0 ? 'bg-emerald-950/5' : 'bg-red-950/5'
              }`}>
                <div className="col-span-1 font-bold text-white flex items-center gap-1 truncate" title={ticker}>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-800 text-orange-400`}>
                    IN
                  </span>
                  {ticker}
                </div>
                <div className="col-span-2 hidden sm:block text-slate-400 truncate text-[7px] sm:text-[9px]" title={s.name}>{s.name}</div>
                <div className="col-span-1 text-right font-bold text-white text-[9px] sm:text-[11px]">
                  <SmoothPrice value={price} decimals={2} prefix={currency} />
                </div>
                <div className={`col-span-1 text-right font-bold price-change ${s.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}
                </div>
                <div className={`col-span-1 text-right font-bold price-change ${s.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                </div>
                <div className="col-span-1 text-right text-slate-500 hidden lg:block">{s.bid > 0 ? `${currency}${s.bid.toFixed(2)}` : '—'}</div>
                <div className="col-span-1 text-right text-slate-500 hidden lg:block">{s.ask > 0 ? `${currency}${s.ask.toFixed(2)}` : '—'}</div>
                <div className="col-span-1 text-right text-slate-500 hidden sm:block">
                  <div className="text-[7px] sm:text-[8px]">{currency}{s.low.toFixed(1)}-{currency}{s.high.toFixed(1)}</div>
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-0.5 hidden sm:block">
                    <div className={`h-1 rounded-full ${s.change >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, posFromLow))}%` }} />
                  </div>
                </div>
                <div className="col-span-1 text-right text-slate-500 text-[8px] hidden lg:block">{s.volume.toLocaleString()}</div>
                <div className="col-span-1 text-right text-slate-500 text-[8px] hidden lg:block">{s.pe ? s.pe.toFixed(1) : '—'}</div>
              </div>
            );
          })}
          {loadingRows.length > 0 && count < 80 && (
            <div className="px-4 py-3 text-[9px] font-mono text-slate-500 border-b border-slate-800/30 animate-pulse">
              Loading {loadingRows.length} more symbols from Yahoo… ({count} ready)
            </div>
          )}
          {count === 0 && (
            <div className="text-center py-12 font-mono">
              <div className="text-[10px] text-slate-500">
                {connectionStatus === 'disconnected'
                  ? '⚠️ Market data unavailable — no connection'
                  : 'Fetching real market data… first quotes usually appear within 30–60s'}
              </div>
              {connectionStatus === 'disconnected' && (
                <div className="text-[8px] text-slate-700 mt-2">Data will resume automatically when connection is restored</div>
              )}
            </div>
          )}
        </div>
        </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[8px] text-slate-600 font-mono border-t border-slate-800/50 pt-3">
        <span>{market.statusMessage}</span>
        <span className="tabular-nums">feed #{feedPulse}</span>
      </div>
    </div>
  );
}
