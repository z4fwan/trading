'use client';
import React, { useMemo, useRef, useEffect } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { isIndianTicker, INDEX_TICKERS } from '@/lib/marketConfig';
import SmoothPrice from '@/components/SmoothPrice';

const SmoothTickerInner = React.memo(function SmoothTickerInner({ items }: { items: { ticker: string; price: number; change: number; changePct: number; currency: string }[] }) {
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
          className="flex items-center gap-1 sm:gap-4 text-[7px] sm:text-[8px] font-mono shrink-0 px-2 sm:px-4 group cursor-pointer hover:bg-white/5 rounded-lg transition-colors py-1"
        >
          <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">{item.ticker}</span>
          <SmoothPrice value={item.price} decimals={2} prefix={item.currency} className="text-zinc-300" />
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

export default function GlobalTicker() {
  const { stocks, indices } = useMarketData();
  
  const tickerItems = useMemo(() => {
    const items: { ticker: string; price: number; change: number; changePct: number; currency: string }[] = [];
    const preferred = ['^NSEI', '^BSESN', '^GSPC', '^IXIC', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM'];
    for (const sym of preferred) {
      const q = sym.startsWith('^') ? indices[sym] : stocks[sym];
      const indian = sym === '^NSEI' || sym === '^BSESN' || sym === '^NSEBANK' || isIndianTicker(sym);
      if (q?.price && q.price > 0) {
        items.push({
          ticker: INDEX_TICKERS[sym] || sym,
          price: q.price,
          change: q.change || 0,
          changePct: q.changePercent || 0,
          currency: indian ? '₹' : '$',
        });
      }
    }
    return items;
  }, [stocks, indices]);

  if (tickerItems.length === 0) {
    return <span className="text-[8px] font-mono text-zinc-600 px-3">Loading ticker…</span>;
  }
  
  return <SmoothTickerInner items={tickerItems} />;
}
