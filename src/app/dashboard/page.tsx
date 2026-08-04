'use client';
import React, { useState, useEffect, useMemo, Suspense, useCallback, useRef, useTransition, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useMarketData } from '@/lib/MarketDataContext';
import { isIndianTicker } from '@/lib/marketConfig';

const AIAnalyticsHub = dynamic(() => import('@/components/AIAnalyticsHub'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading AI analytics…</div>,
});
const EndOfDayReport = dynamic(() => import('@/components/EndOfDayReport'), {
  ssr: false, loading: () => null,
});
const LearningProgress = dynamic(() => import('@/components/LearningProgress'), {
  ssr: false, loading: () => null,
});
const AISelfLearningLoop = dynamic(() => import('@/components/AISelfLearningLoop'), {
  ssr: false, loading: () => null,
});
import { getSessionRole } from '@/lib/sessionManager';
import PanelErrorBoundary from '@/components/PanelErrorBoundary';
import SmoothPrice from '@/components/SmoothPrice';
import TraderEdgePanel from '@/components/TraderEdgePanel';
import AccuracySnapshot from '@/components/AccuracySnapshot';
import AccessControlPanel from '@/components/AccessControlPanel';

const StockMarketList = dynamic(() => import('@/components/StockMarketList'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading stock data…</div>,
});
const TradingChart = dynamic(() => import('@/components/TradingChart'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading chart…</div>,
});
const WeeklyPredictions = dynamic(() => import('@/components/WeeklyPredictions'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading predictions…</div>,
});
const LiveMarketPrices = dynamic(() => import('@/components/LiveMarketPrices'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading price feed…</div>,
});
const AITrustEngine = dynamic(() => import('@/components/AITrustEngine'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading trust engine…</div>,
});
const HighMomentumScanner = dynamic(() => import('@/components/HighMomentumScanner'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading momentum scanner…</div>,
});
const IntradayDashboard = dynamic(() => import('@/components/IntradayDashboard'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading intraday scanner…</div>,
});
const AIEventDashboard = dynamic(() => import('@/components/AIEventDashboard'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading event dashboard…</div>,
});
const QuantStrategiesPanel = dynamic(() => import('@/components/QuantStrategiesPanel'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading quant strategies…</div>,
});
const BacktestPanel = dynamic(() => import('@/components/BacktestPanel'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading backtests…</div>,
});
const OptionsFlowPanel = dynamic(() => import('@/components/OptionsFlowPanel'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading options flow…</div>,
});
const RiskDashboard = dynamic(() => import('@/components/RiskDashboard'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading risk analytics…</div>,
});
const MacroEconomicTracker = dynamic(() => import('@/components/MacroEconomicTracker').then(mod => mod.MacroEconomicTracker), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-32 text-slate-500 font-mono text-sm animate-pulse">Loading macro data…</div>,
});

type NavView = 'overview' | 'chart' | 'stocks' | 'predictions' | 'momentum' | 'intraday' | 'trust' | 'prices' | 'access' | 'announcements' | 'quant' | 'backtest' | 'options' | 'risk' | 'edge';

const SmoothTicker = React.memo(function SmoothTicker({ items }: { items: { ticker: string; price: number; change: number; changePct: number; currency: string }[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    posRef.current = 0;
    const step = () => {
      posRef.current -= 0.6;
      const half = el.scrollWidth / 2;
      if (half > 0 && Math.abs(posRef.current) >= half) posRef.current = 0;
      el.style.transform = `translateX(${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [items.length]);

  const doubled = useMemo(() => [...items, ...items], [items]);

  return (
    <div ref={scrollRef} className="flex whitespace-nowrap" style={{ willChange: 'transform' }}>
      {doubled.map((item, i) => (
        <div
          key={`${item.ticker}-${i < items.length ? 'a' : 'b'}-${i}`}
          className="flex items-center gap-1 sm:gap-4 text-[7px] sm:text-[8px] font-mono shrink-0 px-2 sm:px-4"
        >
          <span className="font-bold text-white">{item.ticker}</span>
          <SmoothPrice value={item.price} decimals={2} prefix={item.currency} className="text-slate-300" />
          <span className={item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {item.change >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.items.length !== next.items.length) return false;
  for (let i = 0; i < prev.items.length; i++) {
    const a = prev.items[i], b = next.items[i];
    if (a.price !== b.price || a.change !== b.change || a.changePct !== b.changePct) return false;
  }
  return true;
});

function WorkspaceView() {
  const searchParams = useSearchParams();
  const { indices, stocks, market } = useMarketData();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const sessionRole = mounted ? getSessionRole() : null;
  const isAdmin = sessionRole === 'admin';

  const rawView = searchParams.get('view') as NavView;
  const guestAllowed: NavView[] = ['overview', 'chart', 'prices', 'announcements'];
  const view = rawView && (!isAdmin && !guestAllowed.includes(rawView) ? 'overview' : rawView) || 'overview';

  const nseIndex = indices['^NSEI'];
  const spIndex = indices['^GSPC'];

  const tickerItems = useMemo(() => {
    const items: { ticker: string; price: number; change: number; changePct: number; currency: string }[] = [];
    const preferred = ['^NSEI', '^BSESN', '^GSPC', '^IXIC', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM'];
    for (const sym of preferred) {
      const q = sym.startsWith('^') ? indices[sym] : stocks[sym];
      const indian = sym === '^NSEI' || sym === '^BSESN' || sym === '^NSEBANK' || isIndianTicker(sym);
      if (q?.price && q.price > 0) {
        items.push({
          ticker: sym,
          price: q.price,
          change: q.change || 0,
          changePct: q.changePercent || 0,
          currency: indian ? '₹' : '$',
        });
      }
    }
    return items;
  }, [stocks, indices]);

  const sectorChanges = useMemo(() => {
    const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'];
    const bankStocks = ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'JPM'];
    const pharmaStocks = ['JNJ', 'UNH'];
    const energyStocks = ['RELIANCE', 'ONGC'];
    const autoStocks = ['MARUTI', 'TSLA'];
    const fmcgStocks = ['ITC', 'TITAN', 'WMT'];
    const avgChange = (tickers: string[]) => {
      const vals = tickers.map(t => stocks[t]?.changePercent).filter(Boolean) as number[];
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    return [
      { name: 'Technology', change: parseFloat(avgChange(techStocks).toFixed(1)), color: 'bg-blue-500' },
      { name: 'Banking', change: parseFloat(avgChange(bankStocks).toFixed(1)), color: 'bg-green-500' },
      { name: 'Pharma', change: parseFloat(avgChange(pharmaStocks).toFixed(1)), color: 'bg-red-400' },
      { name: 'FMCG', change: parseFloat(avgChange(fmcgStocks).toFixed(1)), color: 'bg-yellow-500' },
      { name: 'Auto', change: parseFloat(avgChange(autoStocks).toFixed(1)), color: 'bg-purple-500' },
      { name: 'Energy', change: parseFloat(avgChange(energyStocks).toFixed(1)), color: 'bg-orange-500' },
    ];
  }, [stocks]);

  const sentimentScore = useMemo(() => {
    const total = sectorChanges.reduce((s, sec) => s + sec.change, 0);
    return Math.min(100, Math.max(0, (total / sectorChanges.length) * 10 + 50));
  }, [sectorChanges]);

  const sentimentLabel = sentimentScore > 60 ? 'Bullish' : sentimentScore > 45 ? 'Neutral' : 'Bearish';
  const sentimentColor = sentimentLabel === 'Bullish' ? 'text-emerald-400' : sentimentLabel === 'Neutral' ? 'text-yellow-400' : 'text-red-400';

  const overviewPanel = (
        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="terminal-card p-3 sm:p-4 col-span-1">
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">NIFTY 50</div>
              <div className="mt-2 min-h-[1.75rem] sm:min-h-[2rem]">
                {nseIndex ? (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <SmoothPrice value={nseIndex.price} decimals={1} className="stat-card-value text-lg sm:text-xl font-bold font-mono text-white" />
                    <span className={`text-[10px] sm:text-xs font-mono font-bold price-change ${nseIndex.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{nseIndex.change >= 0 ? '+' : ''}{nseIndex.changePercent.toFixed(2)}%</span>
                  </div>
                ) : <span className="text-[10px] text-slate-600 font-mono">Loading…</span>}
              </div>
            </div>
            <div className="terminal-card p-3 sm:p-4 col-span-1">
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">S&P 500</div>
              <div className="mt-2 min-h-[1.75rem] sm:min-h-[2rem]">
                {spIndex ? (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <SmoothPrice value={spIndex.price} decimals={1} className="stat-card-value text-lg sm:text-xl font-bold font-mono text-white" />
                    <span className={`text-[10px] sm:text-xs font-mono font-bold price-change ${spIndex.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{spIndex.change >= 0 ? '+' : ''}{spIndex.changePercent.toFixed(2)}%</span>
                  </div>
                ) : <span className="text-[10px] text-slate-600 font-mono">Loading…</span>}
              </div>
            </div>
            <div className="terminal-card p-3 sm:p-4 col-span-1">
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Sentiment</div>
              <div className="flex items-center gap-2 mt-2">
                <div className={`stat-card-value text-lg sm:text-xl font-bold font-mono ${sentimentColor}`}>{Math.round(sentimentScore)}</div>
                <div className={`text-[10px] sm:text-xs font-bold font-mono uppercase ${sentimentColor}`}>{sentimentLabel}</div>
              </div>
            </div>
            <AccuracySnapshot />
          </div>

          <MacroEconomicTracker />

          <div className="grid grid-cols-1 gap-5 lg:gap-6 items-start">
            <div className="min-w-0">
              <PanelErrorBoundary title="AI analytics failed to load">
                <AIAnalyticsHub marketMode="INDIAN" isActive={view === 'overview'} />
              </PanelErrorBoundary>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            <EndOfDayReport />
            {mounted && isAdmin && <LearningProgress />}
            <div className="terminal-card p-4 sm:p-5 lg:col-span-1 xl:col-span-1">
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-3">Sector Performance</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {sectorChanges.map((sector, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-950/40 rounded-lg px-3 py-2.5 border border-slate-800/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${sector.color}`} />
                      <span className="text-[10px] font-mono text-slate-300 truncate">{sector.name}</span>
                    </div>
                    <span className={`text-[10px] font-bold font-mono shrink-0 ml-2 ${sector.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sector.change >= 0 ? '+' : ''}{sector.change}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
  );

  const renderMainContent = () => (
      <div className="mt-4">
        <div className={view === 'overview' ? '' : 'hidden'}>
          {overviewPanel}
        </div>
        <div className={view === 'chart' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Chart failed to load">
             <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden h-[800px] max-h-[85vh] flex flex-col shadow-xl">
               <TradingChart variant="page" />
             </div>
          </PanelErrorBoundary>
        </div>
        <div className={view === 'stocks' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Stock list failed to load">
            <StockMarketList />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'predictions' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Predictions failed to load">
            <WeeklyPredictions />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'momentum' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Momentum scanner failed to load">
            <HighMomentumScanner />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'intraday' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Intraday dashboard failed to load">
            <IntradayDashboard />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'trust' ? '' : 'hidden'}>
          <PanelErrorBoundary title="AI trust panel failed to load">
            <AITrustEngine />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'prices' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Live prices failed to load">
            <LiveMarketPrices />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'announcements' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Announcements feed failed to load">
            <AIEventDashboard />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'access' ? '' : 'hidden'}>
          <AccessControlPanel />
        </div>
        <div className={view === 'quant' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Quant strategies failed to load">
            <QuantStrategiesPanel />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'backtest' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Backtest failed to load">
            <BacktestPanel />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'options' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Options flow failed to load">
            <OptionsFlowPanel />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'risk' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Risk dashboard failed to load">
            <RiskDashboard />
          </PanelErrorBoundary>
        </div>
        <div className={view === 'edge' ? '' : 'hidden'}>
          <PanelErrorBoundary title="Trade Edge failed to load">
            <TraderEdgePanel />
          </PanelErrorBoundary>
        </div>
      </div>
  );

  return (
    <>
      {mounted && isAdmin && <AISelfLearningLoop />}
      <div className="w-full min-w-0">
        <div className="relative overflow-hidden h-8 sm:h-9 terminal-card flex items-center mb-2">
          <div className="absolute left-0 top-0 bottom-0 z-10 bg-linear-to-r from-[rgba(15,23,42,0.45)] to-transparent w-6 sm:w-8 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 z-10 bg-linear-to-l from-[rgba(15,23,42,0.45)] to-transparent w-6 sm:w-8 pointer-events-none" />
          {tickerItems.length > 0 ? <SmoothTicker items={tickerItems} /> : (
            <span className="text-[8px] font-mono text-slate-600 px-3">Loading ticker…</span>
          )}
        </div>

        {renderMainContent()}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">Loading terminal…</div>}>
      <WorkspaceView />
    </Suspense>
  );
}
