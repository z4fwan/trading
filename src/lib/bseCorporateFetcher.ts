/**
 * Live BSE corporate announcements — free, no API key.
 *
 * NSE announcements are already covered by nseCorporateFetcher.ts. This adds
 * BSE so the AI sees filings that only hit BSE (or hit BSE first). BSE's public
 * endpoint is picky: it wants a browser-like UA plus BSE Referer/Origin, and it
 * may still block datacenter IPs — so this degrades to an empty list rather than
 * throwing.
 *
 * The response carries `NSURL`, the NSE symbol; we prefer that so the ticker
 * lines up with our NSE-based universe.
 */

import * as https from 'https';
import { addDynamicTicker } from './dynamicUniverse';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

interface BseRow {
  NSURL?: string;
  SCRIP_CD?: number | string;
  SLONGNAME?: string;
  NEWSSUB?: string;
  NEWS_DT?: string;
  ATTACHMENTNAME?: string;
  NEWSID?: string;
}

function fetchOnce(): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[]> {
  return new Promise((resolve) => {
    const to = new Date();
    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const path =
      `/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1` +
      `&strPrevDate=${yyyymmdd(from)}&strScrip=&strSearch=P&strToDate=${yyyymmdd(to)}&strType=C`;

    const req = https.request(
      {
        hostname: 'api.bseindia.com',
        port: 443,
        path,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.bseindia.com/corporates/ann.html',
          Origin: 'https://www.bseindia.com',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const rows: BseRow[] = Array.isArray(parsed?.Table) ? parsed.Table : [];
            const items = rows
              .slice(0, 25)
              .map((item) => {
                const symbol = (item.NSURL || '').toString().trim().toUpperCase();
                if (symbol) addDynamicTicker(symbol);
                const name = (item.SLONGNAME || '').toString().trim();
                const subject = (item.NEWSSUB || '').toString().replace(/\s+/g, ' ').trim();
                const label = symbol || name || String(item.SCRIP_CD || '');
                const url = item.ATTACHMENTNAME
                  ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`
                  : 'https://www.bseindia.com/corporates/ann.html';
                return {
                  headline: `[${label}] BSE Filing: ${subject}`,
                  source: 'NSE/BSE Corporate',
                  tickers: symbol ? [symbol] : [],
                  url,
                };
              })
              .filter((i) => i.headline.length > 20 && !i.headline.endsWith('BSE Filing: '));
            resolve(items);
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on('error', () => resolve([]));
    req.setTimeout(12000, () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

/** Best-effort live BSE corporate announcements. Never throws. */
export async function fetchLiveBSEAnnouncements(): Promise<
  { headline: string; source: string; tickers: string[]; url?: string }[]
> {
  try {
    return await fetchOnce();
  } catch {
    return [];
  }
}
