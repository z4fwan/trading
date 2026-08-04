import * as https from 'https';
import { addDynamicTicker } from './dynamicUniverse';

const lastDealIds = new Set<string>();

export interface NSEInstitutionalSignal {
  ticker: string;
  direction: 'BUY' | 'SELL';
  label: string;        // "Bulk Deal" / "Block Deal"
  counterparty: string; // broker/buyer/seller name
  quantity: number;
  price: number;
  value: number;        // qty * price (raw ₹)
  headline: string;
}

function toInstitutionalSignal(item: any, label: string): NSEInstitutionalSignal | null {
  const symbol = item.symbol || item.security || '';
  if (!symbol) return null;
  const qty = item.quantity || item.tradedQuantity || 0;
  const price = item.price || item.tradePrice || item.tradedPrice || 0;
  const value = qty * price;
  const counterparty = item.buyerName || item.sellerName || item.brokerName || '';
  const direction: 'BUY' | 'SELL' = item.buyerName ? 'BUY' : 'SELL';
  const action = direction === 'BUY' ? 'Buying' : 'Selling';
  const valueStr = value >= 1e7
    ? `₹${(value / 1e7).toFixed(2)}Cr`
    : value >= 1e5
      ? `₹${(value / 1e5).toFixed(2)}L`
      : `₹${value.toFixed(0)}`;
  return {
    ticker: symbol,
    direction,
    label,
    counterparty,
    quantity: qty,
    price,
    value,
    headline: `[${symbol}] ${label}: ${counterparty} ${action} ${qty.toLocaleString()} shares @ ${price} (${valueStr}) — ${direction === 'BUY' ? 'accumulation' : 'distribution'}`,
  };
}

/**
 * Free institutional-money signal from NSE's official bulk/block-deal feed.
 * Institutional accumulation (BUY) or distribution (SELL) is a genuine
 * smart-money edge for intraday direction — and it costs nothing.
 * Cached briefly so the 15-min scanner doesn't hammer NSE every cycle.
 */
let instCache: { at: number; signals: NSEInstitutionalSignal[] } = { at: 0, signals: [] };
const INST_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchInstitutionalSignals(): Promise<NSEInstitutionalSignal[]> {
  const now = Date.now();
  if (instCache.at && now - instCache.at < INST_CACHE_TTL_MS) return instCache.signals;
  const items = await fetchLiveBulkDeals();
  const signals = items
    .map((it, i) => {
      // Re-map headline-driven raw items into structured signals by re-deriving
      // from the original deal feed shape is lossy, so reconstruct from headline
      // as a fallback and prefer fresh structured parsing below.
      const dir = it.headline.includes('accumulation') ? 'BUY' : it.headline.includes('distribution') ? 'SELL' : null;
      if (!dir) return null;
      const qtyMatch = it.headline.match(/([\d,]+) shares/);
      const priceMatch = it.headline.match(/@ ([\d.]+)/);
      return {
        ticker: it.tickers[0],
        direction: dir,
        label: it.source.replace('NSE ', ''),
        counterparty: '',
        quantity: qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ''), 10) : 0,
        price: priceMatch ? parseFloat(priceMatch[1]) : 0,
        value: 0,
        headline: it.headline,
      } as NSEInstitutionalSignal;
    })
    .filter((s): s is NSEInstitutionalSignal => s !== null);
  instCache = { at: now, signals };
  return signals;
}

export async function fetchLiveBulkDeals(): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[]> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.nseindia.com',
      port: 443,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };

    const req = https.request(options, (res) => {
      const cookies = res.headers['set-cookie'];
      let cookieStr = '';
      if (cookies) {
        cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
      }

      Promise.all([
        fetchDealApi('/api/bulk-deals', cookieStr, 'Bulk Deal'),
        fetchDealApi('/api/block-deals', cookieStr, 'Block Deal'),
      ]).then(([bulk, block]) => {
        resolve([...bulk, ...block]);
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}

function fetchDealApi(
  path: string,
  cookieStr: string,
  label: string,
): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[]> {
  return new Promise((resolve) => {
    const apiOptions = {
      hostname: 'www.nseindia.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Cookie': cookieStr,
        'Referer': 'https://www.nseindia.com/market-data/bulk-block-deals'
      }
    };

    const apiReq = https.request(apiOptions, (apiRes) => {
      let data = '';
      apiRes.on('data', d => data += d);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const rows: any[] = parsed?.data || parsed || [];
          if (!Array.isArray(rows)) { resolve([]); return; }

          const items = rows.slice(0, 15).map((item: any) => {
            const symbol = item.symbol || item.security || '';
            if (symbol) addDynamicTicker(symbol);

            const qty = item.quantity || item.tradedQuantity || 0;
            const price = item.price || item.tradePrice || item.tradedPrice || 0;
            const value = (qty * price);
            const valueStr = value >= 1e7
              ? `₹${(value / 1e7).toFixed(2)}Cr`
              : value >= 1e5
                ? `₹${(value / 1e5).toFixed(2)}L`
                : `₹${value.toFixed(0)}`;

            const dealId = `${symbol}|${label}|${qty}|${price}|${item.date || ''}`;
            if (lastDealIds.has(dealId)) return null;
            lastDealIds.add(dealId);
            if (lastDealIds.size > 500) {
              const first = lastDealIds.values().next().value;
              if (first != null) lastDealIds.delete(first);
            }

            const byLabel = item.buyerName || item.sellerName || item.brokerName || '';
            const action = (item.buyerName ? 'Buying' : 'Selling');
            const direction = item.buyerName ? 'accumulation' : 'distribution';

            return {
              headline: `[${symbol}] ${label}: ${byLabel} ${action} ${qty.toLocaleString()} shares @ ${price} (${valueStr}) — ${direction}`,
              source: `NSE ${label}`,
              tickers: [symbol],
              url: `https://www.nseindia.com/market-data/bulk-block-deals`
            };
          }).filter(Boolean) as { headline: string; source: string; tickers: string[]; url?: string }[];

          resolve(items);
        } catch { resolve([]); }
      });
    });

    apiReq.on('error', () => resolve([]));
    apiReq.end();
  });
}