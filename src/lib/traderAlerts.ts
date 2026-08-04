'use client';

export type PriceAlert = {
  id: string;
  ticker: string;
  direction: 'ABOVE' | 'BELOW';
  targetPrice: number;
  createdAt: number;
  triggeredAt?: number;
  tradeType?: string;
  type?: 'TARGET' | 'STOP_LOSS';
  expectedAmount?: number;
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

export function addPriceAlert(
  ticker: string, 
  direction: 'ABOVE' | 'BELOW', 
  targetPrice: number,
  tradeType?: string,
  type?: 'TARGET' | 'STOP_LOSS',
  expectedAmount?: number
): PriceAlert {
  const list = read();
  const alert: PriceAlert = {
    id: `${ticker}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ticker: ticker.toUpperCase(),
    direction,
    targetPrice,
    createdAt: Date.now(),
    tradeType,
    type,
    expectedAmount
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

  // Get current time in IST
  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false } as const;
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const timeStr = formatter.format(now);
  const [hourStr, minStr] = timeStr.split(':');
  const istHour = parseInt(hourStr, 10);
  const istMin = parseInt(minStr, 10);

  // Market closes at 15:30 IST
  const isMarketClosed = istHour > 15 || (istHour === 15 && istMin >= 30);

  for (const a of list) {
    if (a.triggeredAt) continue;

    // Check for Intraday auto-expire
    if (a.tradeType === 'INTRADAY' && isMarketClosed) {
      fired.push({ ...a, triggeredAt: Date.now() });
      
      const message = `[⏳ INTRADAY EXPIRED]\nTicker: ${a.ticker}\nAlert: ${a.type || 'TRADE'} cancelled due to market close.`;
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }).catch(e => console.error('Failed to trigger Telegram alert:', e));
      continue;
    }

    const p = prices[a.ticker];
    if (!p || p <= 0) {
      remaining.push(a);
      continue;
    }
    const hit = a.direction === 'ABOVE' ? p >= a.targetPrice : p <= a.targetPrice;
    if (hit) {
      fired.push({ ...a, triggeredAt: Date.now() });
      
      const title = a.type === 'TARGET' ? '🎯 TARGET HIT' : a.type === 'STOP_LOSS' ? '🛑 STOP LOSS HIT' : '🚨 TRADE ALERT';
      // Trigger Telegram bot alert
      const message = `[${title}]\nTicker: ${a.ticker}\nCondition: ${a.direction} ${a.targetPrice}\nPrice Hit: ${p.toFixed(2)}`;
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }).catch(e => console.error('Failed to trigger Telegram alert:', e));
      
    } else {
      remaining.push(a);
    }
  }

  const triggered = list.filter(a => a.triggeredAt);
  write([...remaining, ...fired, ...triggered.slice(-20)]);
  return { fired, remaining };
}
