import * as https from 'https';
import { addDynamicTicker } from './dynamicUniverse';

/**
 * Bypasses NSE WAF by acquiring cookies from the homepage first,
 * then fetches real-time corporate announcements.
 */
export async function fetchLiveNSEAnnouncements(): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[]> {
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

      // Step 2: Fetch Announcements
      const apiOptions = {
        hostname: 'www.nseindia.com',
        port: 443,
        path: '/api/corporate-announcements?index=equities',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Cookie': cookieStr,
          'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-announcements'
        }
      };

      const apiReq = https.request(apiOptions, (apiRes) => {
        let data = '';
        apiRes.on('data', d => data += d);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed)) {
              resolve([]);
              return;
            }

            // Map NSE raw data to expected format
            const items = parsed.slice(0, 20).map((item: any) => {
              if (item.symbol) {
                // Discover and add any new NSE ticker automatically!
                addDynamicTicker(item.symbol);
              }
              return {
                headline: `[${item.symbol}] ${item.desc || 'Update'}: ${item.attchmntText || item.subject || ''}`,
                source: 'NSE/BSE Corporate',
                tickers: [item.symbol],
                url: item.attchmntFile || `https://www.nseindia.com/companies-listing/corporate-filings-announcements`
              };
            });

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
