'use client';

export type PriceAlert = {
  id: string;
  ticker: string;
  direction: 'ABOVE' | 'BELOW';
  targetPrice: number;
  createdAt: number;
  triggeredAt?: number;
};

const KEY = 'trader_price_alerts_v1';

function read(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as PriceAlert[] : [];
  } catch {
    return [];
  }
}

function write(list: PriceAlert[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
}

export function getPriceAlerts(): PriceAlert[] {
  return read().filter(a => !a.triggeredAt);
}

export function addPriceAlert(ticker: string, direction: 'ABOVE' | 'BELOW', targetPrice: number): PriceAlert {
  const list = read();
  const alert: PriceAlert = {
    id: `${ticker}-${Date.now()}`,
    ticker: ticker.toUpperCase(),
    direction,
    targetPrice,
    createdAt: Date.now(),
  };
  list.push(alert);
  write(list);
  return alert;
}

export function removePriceAlert(id: string) {
  write(read().filter(a => a.id !== id));
}

export function checkAlerts(
  prices: Record<string, number>,
): { fired: PriceAlert[]; remaining: PriceAlert[] } {
  const list = read();
  const fired: PriceAlert[] = [];
  const remaining: PriceAlert[] = [];

  for (const a of list) {
    if (a.triggeredAt) continue;
    const p = prices[a.ticker];
    if (!p || p <= 0) {
      remaining.push(a);
      continue;
    }
    const hit = a.direction === 'ABOVE' ? p >= a.targetPrice : p <= a.targetPrice;
    if (hit) {
      fired.push({ ...a, triggeredAt: Date.now() });
    } else {
      remaining.push(a);
    }
  }

  const triggered = list.filter(a => a.triggeredAt);
  write([...remaining, ...fired, ...triggered.slice(-20)]);
  return { fired, remaining };
}
