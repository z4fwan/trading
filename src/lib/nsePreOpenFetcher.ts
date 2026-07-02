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

/**
 * Bypasses NSE WAF by acquiring cookies from the homepage first,
 * then fetches the real-time Pre-Open Market Data (9:00 AM - 9:08 AM).
 */
export async function fetchLivePreOpenData(): Promise<PreOpenData[]> {
  return new Promise((resolve) => {
    // Step 1: Acquire cookies
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
      let cookies = res.headers['set-cookie'];
      let cookieStr = '';
      if (cookies) {
        cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
      }

      // Step 2: Fetch Pre-Open Market Data
      const apiOptions = {
        hostname: 'www.nseindia.com',
        port: 443,
        path: '/api/market-data-pre-open?key=ALL',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Cookie': cookieStr,
          'Referer': 'https://www.nseindia.com/market-data/pre-open-market-cm-and-emerge-market'
        }
      };

      const apiReq = https.request(apiOptions, (apiRes) => {
        let data = '';
        apiRes.on('data', d => data += d);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed || !Array.isArray(parsed.data)) {
              resolve([]);
              return;
            }

            const items: PreOpenData[] = parsed.data.map((item: any) => ({
              symbol: item.metadata?.symbol || '',
              finalPrice: item.metadata?.lastPrice || 0,
              change: item.metadata?.change || 0,
              pChange: item.metadata?.pChange || 0,
              totalBuyQuantity: item.detail?.preOpenMarket?.totalBuyQuantity || 0,
              totalSellQuantity: item.detail?.preOpenMarket?.totalSellQuantity || 0,
              totalTradedVolume: item.detail?.preOpenMarket?.totalTradedVolume || 0,
            })).filter((i: PreOpenData) => i.symbol !== '');

            resolve(items);
          } catch (e) {
            resolve([]);
          }
        });
      });

      apiReq.on('error', () => resolve([]));
      apiReq.end();
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}
