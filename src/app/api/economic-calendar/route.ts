import { NextResponse } from 'next/server';
import { fetchEconomicCalendar } from '@/lib/economicCalendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

let cachedData: any = null;
let lastFetch = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchInvestopediaFeed() {
  try {
    const res = await fetch('https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    const xml = await res.text();
    const items = [];
    const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = regex.exec(xml)) !== null && items.length < 5) {
      items.push({
        title: match[1].trim(),
        link: match[2].trim()
      });
    }
    // Fallback if CDATA is not used
    if (items.length === 0) {
      const regexFallback = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi;
      while ((match = regexFallback.exec(xml)) !== null && items.length < 5) {
        items.push({
          title: match[1].trim().replace(/<!\[CDATA\[|\]\]>/g, ''),
          link: match[2].trim()
        });
      }
    }
    return items;
  } catch (e) {
    return [];
  }
}

export async function GET() {
  const now = Date.now();
  if (cachedData && now - lastFetch < CACHE_TTL) {
    return NextResponse.json(cachedData, { headers: { 'x-source': 'cache' } });
  }

  try {
    const [events, investopedia] = await Promise.all([
      fetchEconomicCalendar(),
      fetchInvestopediaFeed()
    ]);

    const tomorrow = now + 48 * 60 * 60 * 1000;
    const upcomingEvents = events
      .filter(e => e.timestamp >= now - 3600000 && e.timestamp <= tomorrow && (e.impact === 'HIGH' || e.impact === 'MEDIUM'))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10); // get top 10 upcoming

    cachedData = {
      events: upcomingEvents,
      investopedia
    };
    lastFetch = now;

    return NextResponse.json(cachedData);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
