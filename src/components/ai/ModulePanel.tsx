'use client';
import type { ReactNode } from 'react';
import type { AIModuleKey } from '@/components/icons/TerminalIcons';
import PanelErrorBoundary from '@/components/PanelErrorBoundary';

const TAB_LABELS: Partial<Record<AIModuleKey, string>> = {
  DAILY: 'Daily predictions',
  SESSION: 'Session signals',
  NEWS: 'News desk',
  PREDICTIONS: 'AI predictions',
  GEMS: 'Hidden gems',
  STOCK_PULSE: 'Stock Pulse',
  SIGNALS: 'Buy signals',
  LEARNING: 'AI learning',
  STRATEGIES: 'Strategies',
};

/** Only mount the active tab — avoids heavy panels in the DOM at once. */
export function ModulePanel({
  moduleKey,
  activeModule,
  children,
}: {
  moduleKey: AIModuleKey;
  activeModule: AIModuleKey;
  children: ReactNode;
}) {
  if (activeModule !== moduleKey) return null;
  return (
    <div id={`panel-${moduleKey}`} role="tabpanel">
      <PanelErrorBoundary title={`${TAB_LABELS[moduleKey] ?? moduleKey} failed to load`}>
        {children}
      </PanelErrorBoundary>
    </div>
  );
}
