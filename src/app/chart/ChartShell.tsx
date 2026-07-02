'use client';

import { useEffect } from 'react';
import { MarketDataProvider } from '@/lib/MarketDataContext';
import { ensureClientSession, startSessionMonitor } from '@/lib/sessionManager';

export default function ChartShell({ children }: { children: React.ReactNode }) {
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

  return <MarketDataProvider>{children}</MarketDataProvider>;
}
