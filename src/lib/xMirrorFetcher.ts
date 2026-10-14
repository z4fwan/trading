/**
 * Free, unofficial X/Twitter intake via nitter-style RSS mirrors.
 *
 * X's official API is paid, so this scrapes public nitter instances that expose
 * an RSS feed per profile. These instances are unreliable (they come and go and
 * are often rate-limited or blocked from datacenter IPs), so:
 *   - every call is wrapped in a hard timeout,
 *   - we try instances in order and stop at the first that answers,
 *   - failures return [] and never throw.
 *
 * Toggle with ENABLE_X_MIRRORS=0 to skip entirely. Default: enabled (best effort).
 */

import { ELITE_TWITTER_HANDLES, INDIAN_ELITE_HANDLES } from './eliteSources';

const NITTER_INSTANCES = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.1d4.us',
  'https://xcancel.com',
  'https://lightbrd.com',
  'https://nitter.net',
];

const MAX_HANDLES = 8;
const PER_FETCH_TIMEOUT_MS = 6000;
const OVERALL_TIMEOUT_MS = 12000;

export interface XMirrorItem {
  headline: string;
  source: string;
  tickers: string[];
  url?: string;
}

function stripAt(handle: string): string {
  return handle.replace(/^@/, '');
}

async function fetchRss(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes('<item>') ? text : null;
  } catch {
    return null;
  }
}

function parseTitles(xml: string, limit: number): { title: string; link: string }[] {
  const out: { title: string; link: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && out.length < limit) {
    const block = m[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const title = (titleMatch?.[1] || '').replace(/<[^>]+>/g, '').trim();
    if (title.length > 5) out.push({ title, link: (linkMatch?.[1] || '').trim() });
  }
  return out;
}

async function fetchHandle(handle: string, deadline: number): Promise<XMirrorItem[]> {
  const user = stripAt(handle);
  for (const inst of NITTER_INSTANCES) {
    if (Date.now() > deadline) return [];
    const xml = await fetchRss(`${inst}/${user}/rss`, Math.min(PER_FETCH_TIMEOUT_MS, deadline - Date.now()));
    if (!xml) continue;
    return parseTitles(xml, 6).map((t) => ({
      headline: t.title,
      source: `${handle} (X)`,
      tickers: [],
      url: t.link || undefined,
    }));
  }
  return [];
}

/**
 * Best-effort free X intake. Returns [] when every mirror is down (the common
 * case) so the news pipeline is never blocked.
 */
export async function fetchXMirrorNews(): Promise<XMirrorItem[]> {
  if (process.env.ENABLE_X_MIRRORS === '0' || process.env.ENABLE_X_MIRRORS === 'false') return [];
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const handles = [...ELITE_TWITTER_HANDLES, ...INDIAN_ELITE_HANDLES].slice(0, MAX_HANDLES);
  const results = await Promise.all(handles.map((h) => fetchHandle(h, deadline)));
  return results.flat();
}
