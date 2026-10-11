import * as https from 'https';

export interface PreOpenData {
  symbol: string;
  finalPrice: number;
  change: number;
  pChange: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  totalTradedVolume: number;
}

export interface PreOpenResult {
  data: PreOpenData[];
  /** True if the NSE endpoint responded with a valid payload (even if empty). */
  reachable: boolean;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

interface RawResponse {
  status: number;
  body: string;
  setCookie: string[];
}

/** Single HTTPS GET with a hard timeout — never hangs, never rejects. */
function httpsGet(path: string, cookie?: string, referer?: string): Promise<RawResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: RawResponse) => { if (!settled) { settled = true; resolve(r); } };

    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
    };
    if (cookie) headers['Cookie'] = cookie;
    if (referer) headers['Referer'] = referer;

    const req = https.request(
      { hostname: 'www.nseindia.com', port: 443, path, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (d) => { data += d; if (data.length > 5_000_000) req.destroy(); });
        res.on('end', () => done({ status: res.statusCode || 0, body: data, setCookie: (res.headers['set-cookie'] as string[]) || [] }));
      },
    );
    req.on('error', () => done({ status: 0, body: '', setCookie: [] }));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); done({ status: 0, body: '', setCookie: [] }); });
    req.end();
  });
}

function cookieHeader(setCookie: string[]): string {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

function parsePreOpen(body: string): PreOpenData[] | null {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    return parsed.data
      .map((item: Record<string, any>) => ({
        symbol: item?.metadata?.symbol || '',
        finalPrice: item?.metadata?.lastPrice || 0,
        change: item?.metadata?.change || 0,
        pChange: item?.metadata?.pChange || 0,
        totalBuyQuantity: item?.detail?.preOpenMarket?.totalBuyQuantity || 0,
        totalSellQuantity: item?.detail?.preOpenMarket?.totalSellQuantity || 0,
        totalTradedVolume: item?.detail?.preOpenMarket?.totalTradedVolume || 0,
      }))
      .filter((i: PreOpenData) => i.symbol !== '');
  } catch {
    return null;
  }
}

async function fetchOnce(): Promise<PreOpenResult> {
  // Step 1: acquire WAF cookies from the homepage
  const home = await httpsGet('/');
  let cookie = cookieHeader(home.setCookie);
  if (!cookie) return { data: [], reachable: false };

  // Step 2: warm up the pre-open landing page (this seeds nsit / nseappid cookies)
  const page = await httpsGet('/market-data/pre-open-market-cm-and-emerge-market', cookie, 'https://www.nseindia.com/');
  if (page.setCookie.length) cookie = cookieHeader(page.setCookie.concat(home.setCookie));

  // Step 3: fetch the pre-open order book
  const api = await httpsGet(
    '/api/market-data-pre-open?key=ALL',
    cookie,
    'https://www.nseindia.com/market-data/pre-open-market-cm-and-emerge-market',
  );
  const data = parsePreOpen(api.body);
  if (data === null) return { data: [], reachable: false };
  return { data, reachable: true };
}

/**
 * Fetch the NSE pre-open auction order book (available 09:00–09:15 IST).
 * Retries with fresh cookies + a hard per-request timeout so a WAF hiccup
 * on one attempt doesn't silently return nothing.
 */
export async function fetchLivePreOpenDataResult(): Promise<PreOpenResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchOnce();
      if (res.reachable) return res;
    } catch { /* retry */ }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  return { data: [], reachable: false };
}

/** Back-compat wrapper used by the legacy pre-market engine. */
export async function fetchLivePreOpenData(): Promise<PreOpenData[]> {
  return (await fetchLivePreOpenDataResult()).data;
}
