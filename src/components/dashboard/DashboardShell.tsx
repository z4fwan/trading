'use client';
import React, { Suspense, useEffect, useState, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketDataProvider } from '@/lib/MarketDataContext';
import MarketStatusBar from '@/components/MarketStatusBar';
import MacroShockBanner from '@/components/MacroShockBanner';
import { startSessionMonitor, ensureClientSession, getSessionRole } from '@/lib/sessionManager';
import { TerminalIcon, type IconName } from '@/components/icons/TerminalIcons';
import CommandPalette from '@/components/CommandPalette';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const ADMIN_NAV: { key: string; label: string; icon: IconName }[] = [
  { key: 'workspace', label: 'Command Workspace', icon: 'shield' },
  { key: 'stocks', label: 'Stock Lists', icon: 'list' },
  { key: 'predictions', label: 'Weekly Predictions', icon: 'calendar' },
  { key: 'trust', label: 'AI Trust Engine', icon: 'search' },
  { key: 'prices', label: 'Live Prices', icon: 'stocks' },
  { key: 'access', label: 'Access Control', icon: 'users' },
];

const GUEST_NAV: { key: string; label: string; icon: IconName }[] = [
  { key: 'workspace', label: 'Dashboard', icon: 'shield' },
  { key: 'prices', label: 'Live Prices', icon: 'stocks' },
];

function Sidebar({ collapsed, onToggle, onNavigate, onOpenCmd, isAdmin }: { collapsed: boolean; onToggle: () => void; onNavigate?: () => void; onOpenCmd?: () => void; isAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') || 'overview';
  const [, startNav] = useTransition();

  const go = (path: string) => {
    startNav(() => router.push(path, { scroll: false }));
    onNavigate?.();
  };

  return (
    <>
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className={`text-emerald-400 font-bold tracking-wider font-mono ${collapsed ? 'text-[10px]' : 'text-sm'}`}>
              {collapsed ? 'QA' : 'QUANTUM_ALPHA_V1'}
            </div>
            {!collapsed && (
              <div className="text-[10px] text-slate-500 uppercase mt-0.5">{isAdmin ? 'Admin Core Terminal' : 'Guest Terminal'}</div>
            )}
          </div>
          <button onClick={onToggle}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800/50 hidden lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <span className="text-[12px]">{collapsed ? '→' : '←'}</span>
          </button>
        </div>
      </div>
      <nav className="flex-1 p-2 sm:p-4 space-y-0.5 sm:space-y-1" role="navigation" aria-label="Dashboard navigation">
        {!collapsed && (
          <div className="text-[10px] uppercase font-bold text-slate-500 px-3 mb-2 tracking-widest">{isAdmin ? 'Market Domains' : 'Guest Access'}</div>
        )}
        {(isAdmin ? ADMIN_NAV : GUEST_NAV).map(item => {
          const navActive = activeView === item.key
            || (item.key === 'workspace' && (activeView === 'overview' || !searchParams.get('view')));
          return (
          <button
            key={item.key}
            onClick={() => go(`/dashboard?view=${item.key === 'workspace' ? 'overview' : item.key}`)}
            className={`w-full text-left rounded-lg transition-all duration-200 flex items-center gap-2 ${
              collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
            } ${
              navActive
                ? 'bg-slate-800/50 text-emerald-400 border border-slate-700/50 font-medium'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/20'
            }`}
            title={collapsed ? item.label : undefined}
            aria-current={navActive ? 'page' : undefined}
          >
            <TerminalIcon name={item.icon} size={14} className={navActive ? 'text-emerald-400 shrink-0' : 'text-slate-500 shrink-0'} />
            {!collapsed && (
              <span className="text-[10px] sm:text-sm">{item.label}</span>
            )}
          </button>
        );})}
      </nav>
      <div className="p-3 sm:p-4 border-t border-slate-800 space-y-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[9px] text-slate-600 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Market Data
            </div>
            <button onClick={onOpenCmd}
              className="w-full flex items-center gap-2 text-[8px] text-slate-600 hover:text-slate-400 font-mono px-2 py-1.5 rounded-lg hover:bg-slate-800/30 transition-all border border-slate-800/50">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="M16 16l4 4" />
              </svg>
              <span>⌘K — Commands</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

function SidebarFallback({ collapsed, isAdmin }: { collapsed: boolean; isAdmin: boolean }) {
  const items = isAdmin ? ADMIN_NAV : GUEST_NAV;
  return (
    <>
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <div className={`text-emerald-400 font-bold tracking-wider font-mono ${collapsed ? 'text-[10px]' : 'text-sm'}`}>
          {collapsed ? 'QA' : 'QUANTUM_ALPHA_V1'}
        </div>
      </div>
      <nav className="flex-1 p-2 sm:p-4 space-y-0.5 sm:space-y-1">
        {items.map(item => (
          <div key={item.key}
            className={`w-full text-slate-500 rounded-lg ${collapsed ? 'px-2 py-2 text-center' : 'px-3 py-2 text-sm'}`}>
            {collapsed ? <TerminalIcon name={item.icon} size={14} className="text-slate-500 mx-auto" /> : item.label}
          </div>
        ))}
      </nav>
    </>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setIsAdmin(getSessionRole() === 'admin');
  }, []);

  useKeyboardShortcuts([
    { key: 'k', meta: true, handler: (e) => { e.preventDefault(); setCmdPaletteOpen(o => !o); } },
    { key: 'd', meta: true, handler: () => router.push('/dashboard?view=overview') },
    { key: 'c', meta: true, shift: true, handler: () => router.push('/dashboard?view=chart') },
    ...(isAdmin ? [
      { key: 'p' as const, meta: true, shift: true, handler: () => router.push('/dashboard?view=predictions') },
      { key: 't' as const, meta: true, shift: true, handler: () => router.push('/dashboard?view=trust') },
      { key: 'a' as const, meta: true, shift: true, handler: () => router.push('/dashboard?view=access') },
      { key: 's' as const, meta: true, shift: true, handler: () => router.push('/dashboard?view=stocks') },
    ] : []),
    { key: 'l', meta: true, shift: true, handler: () => router.push('/dashboard?view=prices') },
    { key: 'Escape', handler: () => setCmdPaletteOpen(false) },
  ]);

  useEffect(() => {
    let stopMonitor: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const ok = await ensureClientSession();
      if (cancelled) return;
      if (!ok) {
        window.location.assign('/login');
        return;
      }
      stopMonitor = startSessionMonitor(60_000);
    })();
    return () => {
      cancelled = true;
      stopMonitor?.();
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) {
        setMobileNavOpen(false);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showMobileDrawer = mobileNavOpen && !isDesktop;
  const asideCollapsed = isDesktop && sidebarCollapsed;

  return (
    <MarketDataProvider>
      <CommandPalette isOpen={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {showMobileDrawer && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <button
          type="button"
          onClick={() => setMobileNavOpen(o => !o)}
          className="fixed bottom-4 left-4 z-50 lg:hidden touch-target bg-slate-900/95 border border-slate-600 rounded-2xl px-4 py-2.5 shadow-2xl shadow-black/50 hover:bg-slate-800 transition-colors"
          aria-label="Toggle navigation"
          aria-expanded={showMobileDrawer}
        >
          <span className="text-[10px] font-mono font-bold text-emerald-400">{showMobileDrawer ? '✕ Close' : '☰ Menu'}</span>
        </button>

        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto transition-all duration-300 border-r border-slate-800 bg-slate-900/95 lg:bg-slate-900/30 flex flex-col shrink-0 overflow-hidden ${
            showMobileDrawer
              ? 'w-[min(18rem,88vw)] translate-x-0'
              : isDesktop
                ? asideCollapsed ? 'w-14 translate-x-0' : 'w-56 lg:w-64 translate-x-0'
                : 'w-0 -translate-x-full pointer-events-none'
          }`}
          role="complementary"
          aria-label="Sidebar navigation"
        >
            <Suspense fallback={<SidebarFallback collapsed={asideCollapsed} isAdmin={isAdmin} />}>
              <Sidebar
                collapsed={asideCollapsed}
                isAdmin={isAdmin}
                onToggle={() => setSidebarCollapsed(c => !c)}
                onNavigate={() => setMobileNavOpen(false)}
                onOpenCmd={() => setCmdPaletteOpen(true)}
              />
          </Suspense>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 w-full">
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8 pb-20 lg:pb-8">
            <div className="dashboard-content space-y-3 sm:space-y-4">
              <MacroShockBanner />
              <MarketStatusBar />
              {children}
            </div>
          </main>
        </div>
      </div>
    </MarketDataProvider>
  );
}
