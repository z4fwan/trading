'use client';

import type { ReactNode } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function PanelErrorBoundary({
  children,
  title = 'This panel failed to load',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="terminal-card p-6 text-center space-y-3">
          <div className="text-amber-400 text-sm font-bold font-mono">⚠️ {title}</div>
          <p className="text-[10px] text-slate-500 font-mono">
            The rest of the dashboard is still available. Refresh the page or switch tabs.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
