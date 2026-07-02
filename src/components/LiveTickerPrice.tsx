'use client';

import SmoothPrice from '@/components/SmoothPrice';
import { isIndianTicker } from '@/lib/marketConfig';
import type { QuoteData } from '@/lib/MarketDataContext';

export function tickerCurrency(ticker: string): string {
  return isIndianTicker(ticker) ? '₹' : '$';
}

/** Live quote from context with smooth numeric transition. */
export default function LiveTickerPrice({
  ticker,
  stocks,
  fallback = 0,
  decimals = 2,
  className = '',
  showChange = false,
}: {
  ticker: string;
  stocks: Record<string, QuoteData>;
  fallback?: number;
  decimals?: number;
  className?: string;
  showChange?: boolean;
}) {
  const q = stocks[ticker];
  const value = q?.price && q.price > 0 ? q.price : fallback;
  if (!value || value <= 0) {
    return <span className={`text-slate-600 font-mono ${className}`}>—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <SmoothPrice value={value} decimals={decimals} prefix={tickerCurrency(ticker)} />
      {showChange && q && (
        <span className={`text-[8px] font-mono font-bold price-change ${q.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
        </span>
      )}
    </span>
  );
}
