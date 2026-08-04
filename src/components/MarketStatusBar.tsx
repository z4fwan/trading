'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { countPricedStocks } from '@/lib/quoteDisplay';

export default function MarketStatusBar() {
  const { market, connectionStatus, lastFetchAt, priceChangeCount, feedPulse, stocks, pricesStreaming } = useMarketData();
  const [llmOn, setLlmOn] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [ageSec, setAgeSec] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/llm').then(r => r.json()).then(d => setLlmOn(!!d.configured)).catch(() => setLlmOn(false));
    const t = setInterval(() => {
      fetch('/api/llm').then(r => r.json()).then(d => setLlmOn(!!d.configured)).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => {
      setAgeSec(lastFetchAt > 0 ? Math.max(0, Math.round((Date.now() - lastFetchAt) / 1000)) : null);
    }, 1000);
    return () => clearInterval(id);
  }, [lastFetchAt, mounted]);

  const stockCount = countPricedStocks(stocks);
  const connected = connectionStatus !== 'disconnected';
  const isBooting = lastFetchAt === 0;

  const safeConnected = !mounted ? true : connected;
  const safeIsBooting = !mounted ? true : isBooting;
  const safeConnStatus = !mounted ? 'connected' : connectionStatus;
  const safePricesStreaming = !mounted ? false : pricesStreaming;

  const connColor = !safeConnected
    ? 'text-red-400 border-red-500/30 bg-red-950/30'
    : safeIsBooting
      ? 'text-yellow-400 border-yellow-500/30 bg-yellow-950/30'
      : safeConnStatus === 'stale'
        ? 'text-amber-400 border-amber-500/30 bg-amber-950/30'
        : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';

  const dotColor = !safeConnected ? 'bg-red-500' : safeIsBooting ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-500 animate-pulse';

  const refreshLabel = !mounted || ageSec === null ? '…' : `${ageSec}s ago`;

  return (
    <div className={`terminal-card px-3 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 transition-colors duration-500 ${connColor}`}>
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] sm:text-[10px] font-mono font-bold flex flex-wrap items-center gap-2">
          <span className={`uppercase tracking-wider ${safeIsBooting ? 'text-yellow-400' : safePricesStreaming ? 'text-emerald-300' : 'text-amber-300'}`}>
            {safeIsBooting ? 'System Starting — Syncing Data...' : safePricesStreaming ? 'Live prices' : 'Last close (market closed)'}
          </span>
          {mounted && !isBooting ? <span className="text-slate-400 font-normal">#{feedPulse}</span> : null}
        </div>
        <div className="text-[7px] sm:text-[8px] font-mono opacity-90 mt-0.5" suppressHydrationWarning>{market.statusMessage}</div>
        {mounted && (
          <div className="text-[7px] sm:text-[8px] font-mono opacity-70 mt-0.5">
            NSE {market.nse.label} ({market.nse.localTime}) · US {market.us.label} ({market.us.localTime})
          </div>
        )}
      </div>
      <div className="text-[7px] sm:text-[8px] font-mono text-right shrink-0 space-y-0.5">
        <div>{stockCount} symbols · refresh {refreshLabel}</div>
        {mounted && (
          <>
            <div>Price ticks: {priceChangeCount} · polls: {feedPulse}</div>
            <div className={llmOn ? 'text-violet-300' : 'text-slate-500'}>AI/LLM news: {llmOn ? 'ON' : 'off (set LLM_API_KEY)'}</div>
          </>
        )}
      </div>
    </div>
  );
}
