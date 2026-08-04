import { NextRequest } from 'next/server';
import { getSocialSentiment, getTrendingTickers, getSentimentCacheStats } from '@/lib/socialSentiment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const action = searchParams.get('action');

  if (action === 'trending') {
    try {
      const trending = await getTrendingTickers();
      const stats = getSentimentCacheStats();
      return Response.json({ trending, cache: stats });
    } catch (e) {
      return Response.json({ trending: [], error: String(e) });
    }
  }

  if (action === 'stats') {
    return Response.json(getSentimentCacheStats());
  }

  if (!ticker) {
    return Response.json({ error: 'ticker param required' }, { status: 400 });
  }

  try {
    const sentiment = await getSocialSentiment(ticker.toUpperCase());
    return Response.json(sentiment);
  } catch (e) {
    return Response.json({ ticker, sentiment: 'NEUTRAL', score: 0, error: String(e) });
  }
}
