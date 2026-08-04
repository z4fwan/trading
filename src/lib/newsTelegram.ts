import type { ClassifiedNewsItem } from './engineState';
import { getMarketBadge } from './marketConfig';
import { getExchangeStatus } from './exchangeHours';

const notifiedTelegramHashes = new Set<string>();

export async function sendTelegramForHighImpact(items: ClassifiedNewsItem[]): Promise<void> {
  // High-impact news BUY/SELL alerts are only actionable while NSE is open or
  // about to open. After hours they'd fire at 5 PM on "stocks to watch" lists
  // and SEBI notices nobody can trade on — exactly the spam the user saw.
  const nse = getExchangeStatus('NSE');
  if (nse.session !== 'OPEN' && nse.session !== 'PRE') {
    if (items.length) console.log(`[Telegram] high-impact alerts suppressed — market ${nse.session} (${nse.label})`);
    return;
  }
  for (const item of items) {
    const vi = (item as any).v5_intelligence;
    if (!vi) continue;
    const prob = Math.round((vi.forecasts?.prob_1day ?? 0) * 100);
    if (prob < 65) continue;
    const hash = `${item.tickers?.[0] || ''}-${item.headline?.slice(0, 20)}`;
    if (notifiedTelegramHashes.has(hash)) continue;
    notifiedTelegramHashes.add(hash);
    if (notifiedTelegramHashes.size > 500) {
      const first = notifiedTelegramHashes.values().next().value;
      if (first != null) notifiedTelegramHashes.delete(first as string);
    }
    const tickers = item.tickers?.length ? item.tickers.join(', ') : 'MACRO / GENERAL';
    const dir = item.sentiment === 'BULLISH' ? '🟢 BUY' : item.sentiment === 'BEARISH' ? '🔴 SELL' : '⚪ WATCH';
    const conf = vi.decision_trace?.confidence_tier || (prob > 70 ? 'HIGH' : 'MEDIUM');
    const movePct = (item as any).llmExpectedMovementPct || (vi.forecasts?.expected_return ? `${(vi.forecasts.expected_return * 100).toFixed(1)}%` : 'N/A');
    const eventType = vi.event_category || item.llmEventType || 'ANNOUNCEMENT';
    const isBullScore = item.source?.includes('BullScore');
    const badgeText = isBullScore ? '🏅 BULLSCORE VERIFIED' : `${prob}% ${conf}`;
    const marketBadge = getMarketBadge(item.tickers?.[0]);
    const text = `
[${marketBadge} MARKET] ${dir} <b>${tickers}</b> | ${eventType.replace(/_/g, ' ')} | ${badgeText}
<b>Headline:</b> ${item.headline?.slice(0, 200) || ''}
<b>Expected:</b> ${movePct} | <b>Source:</b> ${item.source || 'NSE'}
<b>Sentiment:</b> ${item.sentiment || 'NEUTRAL'}
`.trim();
    try {
      const body = JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      });
      const { request } = await import('https');
      await new Promise<void>((resolve, reject) => {
        const u = new URL(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`);
        const req = request({
          hostname: u.hostname, path: u.pathname + u.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 10000, family: 4,
        }, (res: any) => { res.on('data', () => {}); res.on('end', () => resolve()); });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });
      console.log(`[Telegram] Alert sent for ${tickers} (${prob}%)`);
    } catch (e) {
      console.warn(`[Telegram] Alert failed for ${tickers}:`, e);
    }
  }
}

export function resetNotifiedHashes(): void {
  notifiedTelegramHashes.clear();
}
