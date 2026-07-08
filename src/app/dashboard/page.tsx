'use client';
import React, { useState, useEffect, useMemo, Suspense, useCallback, useRef, useTransition, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDEX_NAMES, isIndianTicker } from '@/lib/marketConfig';
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
import { getSessionCookie, getSessionRole, signOut } from '@/lib/sessionManager';
import PanelErrorBoundary from '@/components/PanelErrorBoundary';
import { TerminalIcon, type IconName } from '@/components/icons/TerminalIcons';
import SmoothPrice from '@/components/SmoothPrice';
import { getFeedStatusDisplay } from '@/lib/feedStatus';
import DashboardClock from '@/components/dashboard/DashboardClock';
import TraderEdgePanel from '@/components/TraderEdgePanel';
import AccuracySnapshot from '@/components/AccuracySnapshot';
import AccessControlPanel from '@/components/AccessControlPanel';
import DataQualityIndicator from '@/components/DataQualityIndicator';

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
const AIEventDashboard = dynamic(() => import('@/components/AIEventDashboard'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading event dashboard…</div>,
});
const LiveTradePortfolio = dynamic(() => import('@/components/LiveTradePortfolio'), {
  ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm animate-pulse">Loading portfolio…</div>,
});

type NavView = 'overview' | 'chart' | 'portfolio' | 'stocks' | 'predictions' | 'momentum' | 'trust' | 'prices' | 'access' | 'announcements';

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
  const router = useRouter();
  const { indices, isLive, pricesStreaming, stocks, market, connectionStatus } = useMarketData();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const sessionRole = mounted ? getSessionRole() : null;
  const isAdmin = sessionRole === 'admin';
  const guestName = useMemo(() => {
    if (!mounted || sessionRole !== 'guest') return '';
    const s = getSessionCookie();
    return s?.name || s?.email?.replace('guest:', '') || 'Guest';
  }, [mounted, sessionRole]);
  const [guestNow, setGuestNow] = useState(() => (typeof window !== 'undefined' ? Date.now() : 0));

  const rawView = searchParams.get('view') as NavView;
  const guestAllowed: NavView[] = ['overview', 'chart', 'prices', 'announcements'];
  const view = rawView && (!isAdmin && !guestAllowed.includes(rawView) ? 'overview' : rawView) || 'overview';

  const [, startViewTransition] = useTransition();
  const setView = useCallback((v: NavView) => {
    if (!isAdmin && !guestAllowed.includes(v)) return;
    startViewTransition(() => {
      router.push(`/dashboard?view=${v}`, { scroll: false });
    });
  }, [router, isAdmin]);

  const session = useMemo(() => (mounted ? getSessionCookie() : null), [mounted]);

  useEffect(() => {
    if (!mounted || isAdmin) return;
    const t = setInterval(() => setGuestNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, [mounted, isAdmin]);

  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);
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
          ticker: INDEX_NAMES[sym] || sym,
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

  const navItems: { id: NavView; icon: IconName; label: string }[] = useMemo(() => {
    const TABS: { id: NavView; label: string; icon: IconName }[] = [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'portfolio', label: 'Portfolio', icon: 'layers' },
    { id: 'chart', label: 'Chart', icon: 'chart' },
    { id: 'prices', label: 'Prices', icon: 'prices' },
    { id: 'announcements', label: 'Announcements', icon: 'news' },
    ];
    const adminNav: { id: NavView; icon: IconName; label: string }[] = [
      { id: 'overview', icon: 'dashboard', label: 'Dashboard' },
      { id: 'portfolio', icon: 'layers', label: 'Portfolio' },
      { id: 'chart', icon: 'chart', label: 'Chart' },
      { id: 'stocks', icon: 'stocks', label: 'Lists' },
      { id: 'predictions', icon: 'predictions', label: 'Weekly' },
      { id: 'momentum', icon: 'predictions', label: 'Momentum' },
      { id: 'trust', icon: 'trust', label: 'Trust' },
      { id: 'prices', icon: 'prices', label: 'Prices' },
      { id: 'announcements', icon: 'news', label: 'Announcements' },
      { id: 'access', icon: 'users', label: 'Access' },
    ];
    return isAdmin ? adminNav : TABS;
  }, [isAdmin]);

  const viewTitles: Record<NavView, string> = {
    overview: 'Dashboard Overview',
    chart: 'Fullscreen Chart',
    portfolio: 'Live Trade Portfolio',
    stocks: 'Stock Market Lists',
    predictions: 'AI Predictions',
    momentum: 'High Momentum Scanner',
    trust: 'AI Trust Engine',
    prices: 'Live Market Prices',
    announcements: 'Live Corporate Announcements',
    access: 'Access Control',
  };

  const overviewPanel = (
        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
            <div className="terminal-card p-3 sm:p-4 col-span-1">
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Feed</div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${feed.dotClass}`} />
                <span className={`text-[10px] sm:text-xs font-mono font-bold ${feed.badgeClass.split(' ')[0]}`}>
                  {feed.label}
                </span>
              </div>
              <p className="text-[8px] sm:text-[9px] text-slate-500 font-mono mt-1.5 line-clamp-2" title={market.statusMessage}>{market.statusMessage}</p>
            </div>
            <AccuracySnapshot />
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5 2xl:gap-6 items-start">
            <div className="2xl:col-span-8 min-w-0">
              <PanelErrorBoundary title="AI analytics failed to load">
                <AIAnalyticsHub marketMode="INDIAN" isActive={view === 'overview'} />
              </PanelErrorBoundary>
              {view === 'chart' && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden h-[600px] flex flex-col shadow-xl">
                  <TradingChart variant="page" />
                </div>
              )}

              {view === 'portfolio' && (
                <Suspense fallback={<div className="h-64 flex items-center justify-center font-mono text-slate-500 text-sm animate-pulse">Loading Portfolio...</div>}>
                  <LiveTradePortfolio />
                </Suspense>
              )}</div>
            <div className="2xl:col-span-4 min-w-0 2xl:sticky 2xl:top-4">
              <TraderEdgePanel />
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
      <>
        <div className={view === 'overview' ? '' : 'hidden'}>
          {overviewPanel}
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
      </>
  );

  if (view === 'chart') {
    return (
      <>
        {mounted && isAdmin && <AISelfLearningLoop />}
        <div className="fixed inset-0 z-60 flex flex-col bg-slate-950 min-h-dvh">
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setView('overview')}
              className="touch-target text-[10px] sm:text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              ← Dashboard
            </button>
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Chart</span>
          </div>
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <PanelErrorBoundary title="Chart failed to load">
              <TradingChartInner />
            </PanelErrorBoundary>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {mounted && isAdmin && <AISelfLearningLoop />}
      <div className="w-full min-w-0">
        <nav className="tab-scroll scrollbar-none mb-4 -mx-1 px-1 sm:mx-0 sm:px-0" aria-label="Dashboard views">
          {navItems.map(item => (
            <button key={item.id} onClick={() => item.id === 'chart' ? setView('chart') : setView(item.id)}
              className={`touch-target shrink-0 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-mono rounded-xl transition-all flex items-center gap-2 ${
                view === item.id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-950/40'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white border border-slate-800/80 bg-slate-900/40'
              }`}>
              <TerminalIcon name={item.icon} size={16} className={view === item.id ? 'text-emerald-400' : 'text-slate-500'} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="relative overflow-hidden h-8 sm:h-9 terminal-card flex items-center mb-4 sm:mb-5">
          <div className="absolute left-0 top-0 bottom-0 z-10 bg-linear-to-r from-slate-900 to-transparent w-6 sm:w-8 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 z-10 bg-linear-to-l from-slate-900 to-transparent w-6 sm:w-8 pointer-events-none" />
          {tickerItems.length > 0 ? <SmoothTicker items={tickerItems} /> : (
            <span className="text-[8px] font-mono text-slate-600 px-3">Loading ticker…</span>
          )}
        </div>

        {/* Guest welcome banner — always in DOM to prevent CLS */}
        <div className={`mb-3 sm:mb-4 min-h-[3.5rem] sm:min-h-[3.75rem] ${mounted && !isAdmin && session ? '' : 'invisible'}`}>
          {mounted && !isAdmin && session && (
            <div className="flex items-center gap-2 bg-linear-to-r from-blue-500/5 to-indigo-500/5 border border-blue-500/20 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-linear-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[8px] sm:text-[10px] font-bold font-mono shrink-0">
                {guestName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] sm:text-[10px] font-bold font-mono text-white truncate">Welcome, {guestName}</div>
                <div className="text-[7px] font-mono text-blue-400/70">Limited guest access</div>
              </div>
              <button onClick={() => { void signOut().then(() => { window.location.href = '/login'; }); }}
                className="text-[7px] sm:text-[8px] font-mono text-slate-500 hover:text-white px-2 py-1 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all shrink-0">
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Admin controls bar — always in DOM to prevent CLS */}
        <div className={`mb-3 sm:mb-4 flex items-center justify-end gap-2 min-h-[2rem] ${mounted && isAdmin ? 'visible' : 'invisible'}`}>
          {mounted && isAdmin && (
            <button onClick={() => { void signOut().then(() => { window.location.href = '/login'; }); }}
              className="text-[7px] sm:text-[8px] font-mono text-slate-500 hover:text-white px-2 py-1 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all">
              Logout
            </button>
          )}
        </div>

        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-800/80 pb-4 mb-5 sm:mb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white font-mono truncate">
              {viewTitles[view]}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 min-h-[1.25rem]">
              <span className="text-[9px] sm:text-[10px] text-slate-500 font-mono line-clamp-1">
                {market.statusMessage || <span className="invisible">placeholder</span>}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-slate-600 min-w-[8rem] text-right tabular-nums">
                {mounted ? <DashboardClock /> : '\u00A0'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 min-h-[2rem]">
            <DataQualityIndicator />
            {mounted && !isAdmin && session ? (() => {
              const remaining = Math.max(0, session.expiresAt - guestNow);
              const h = Math.floor(remaining / 3600000);
              const m = Math.floor((remaining % 3600000) / 60000);
              const s = Math.floor((remaining % 60000) / 1000);
              return (
                <span className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono px-2.5 py-1.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                  <span className="hidden sm:inline text-blue-300">{guestName}:</span>
                  <span className="font-bold tracking-wider tabular-nums">{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>
                </span>
              );
            })() : (
              <span className={`flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono px-2.5 py-1.5 rounded-full border ${isLive ? (pricesStreaming ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20') : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? (pricesStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500') : 'bg-red-500'}`} />
                {!isLive ? 'OFFLINE' : pricesStreaming ? 'LIVE' : 'CLOSED'}
              </span>
            )}
          </div>
        </header>

        {renderMainContent()}
      </div>
    </>
  );
}

const TradingChartInner = dynamic(
  () => import('@/components/TradingChart').then(mod => {
    function EmbeddedChart() {
      return <mod.default variant="embedded" />;
    }
    return { default: EmbeddedChart };
  }),
  {
    ssr: false,
    loading: () => <div className="flex h-full min-h-[200px] items-center justify-center text-slate-500 font-mono text-sm animate-pulse">Loading chart…</div>,
  },
);

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">Loading terminal…</div>}>
      <WorkspaceView />
    </Suspense>
  );
}
