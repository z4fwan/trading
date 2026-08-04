import { fetchLiveNSEAnnouncements } from './nseCorporateFetcher';
import { fetchLivePreOpenData, type PreOpenData } from './nsePreOpenFetcher';
import { callLLMJson } from './llmProvider';
import { sendTelegramMessage } from './telegramBot';
import { getDynamicIndianUniverse } from './dynamicUniverse';

interface AlphaCatalyst {
  ticker: string;
  reasoning: string;
  conviction: number; // 0 to 100
  catalystType: 'DIVIDEND' | 'CLINICAL_TRIAL' | 'EARNINGS' | 'ANALYST_UPGRADE' | 'M&A' | 'OTHER';
}

let lastAlphaDate = '';

function sendTelegram(text: string): void {
  sendTelegramMessage(text).catch(() => {});
}

function extractOrderWinText(announcement: { headline: string; tickers: string[] }): string | null {
  const headline = announcement.headline.toUpperCase();
  const ticker = announcement.tickers[0] || '';
  if (headline.includes('ORDER')) {
    // Try to extract a rough price impact estimate from headline keywords
    const hasWorth = /WORTH\s*(?:₹|RS|INR)?\s*([\d,]+)/i.exec(announcement.headline);
    const worthStr = hasWorth ? ` Worth ₹${hasWorth[1]}` : '';
    return `🔔 <b>OVERNIGHT ORDER WIN — ${ticker}</b>${worthStr}
<b>Headline:</b> ${announcement.headline?.slice(0, 200)}
<b>Expected:</b> Gap Up +3-7% | Source: NSE/BSE Corporate
<b>Action:</b> Watch pre-open for confirmation`;
  }
  return null;
}

export async function runPreMarketAlphaCycle(isPreOpenWindow: boolean): Promise<void> {
  const todayDate = new Date().toISOString().split('T')[0];
  
  console.log('[PreMarket] Starting Alpha Scan...');
  
  // 1. Fetch Overnight Corporate Announcements
  const announcements = await fetchLiveNSEAnnouncements();
  
  // Filter for valid tickers in the dynamic universe
  const dynamicUniverse = getDynamicIndianUniverse();
  const validAnnouncements = announcements.filter(a => 
    a.tickers.some(t => dynamicUniverse.includes(t))
  );

  if (validAnnouncements.length === 0) {
    console.log('[PreMarket] No significant overnight announcements found.');
    return;
  }

  // 1b. Fire individual ORDER_WIN alerts immediately (predictive, before LLM)
  const orderWinNotified = new Set<string>();
  for (const ann of validAnnouncements) {
    const alert = extractOrderWinText(ann);
    if (!alert) continue;
    const dedupKey = ann.tickers[0] || ann.headline.slice(0, 30);
    if (orderWinNotified.has(dedupKey)) continue;
    orderWinNotified.add(dedupKey);
    sendTelegram(alert);
    console.log(`[PreMarket] ORDER_WIN alert sent for ${ann.tickers[0]}`);
  }

  // 2. LLM Catalyst Scoring
  const prompt = `
Analyze these overnight corporate announcements from the Indian Stock Market.
Identify the top 1-5 most explosive catalysts that will cause the stock to GAP UP today.
Focus on: Dividends/Ex-Dates, Clinical Trial Success, Massive Earnings Beats, or Mergers.

Use available terms: DIVIDEND, CLINICAL_TRIAL, EARNINGS, ANALYST_UPGRADE, M&A, OTHER

Announcements:
${JSON.stringify(validAnnouncements.slice(0, 30), null, 2)}

Return strict JSON:
{
  "picks": [
    {
      "ticker": "RELIANCE",
      "reasoning": "1 sentence explaining the gap-up catalyst.",
      "conviction": 95,
      "catalystType": "DIVIDEND"
    }
  ]
}`;

  try {
    const { data } = await callLLMJson<{ picks: AlphaCatalyst[] }>(
      'You are an elite hedge fund pre-market quantitative analyst.',
      prompt,
      800,
      'groq'
    );

    let finalPicks = data?.picks || [];

    // 3. Cross-reference with Pre-Open Order Book (if inside the 9:00 - 9:08 window)
    if (isPreOpenWindow) {
      console.log('[PreMarket] Fetching Live Pre-Open Auction Volumes...');
      const preOpen = await fetchLivePreOpenData();
      const preOpenMap = new Map(preOpen.map(p => [p.symbol, p]));

      finalPicks = finalPicks.map(pick => {
        const liveData = preOpenMap.get(pick.ticker);
        if (liveData) {
          const buyRatio = liveData.totalBuyQuantity / (liveData.totalSellQuantity || 1);
          if (buyRatio > 2.0) {
            pick.conviction = Math.min(100, pick.conviction + 15);
            pick.reasoning += ` Massive Pre-Open Buy Queue (${(buyRatio).toFixed(1)}x sellers).`;
          } else if (buyRatio < 0.5) {
            pick.conviction -= 20;
          }
        }
        return pick;
      });
    }

    // Filter high conviction
    const highConviction = finalPicks.filter(p => p.conviction >= 75).sort((a, b) => b.conviction - a.conviction);

    if (highConviction.length > 0) {
      if (lastAlphaDate === todayDate && !isPreOpenWindow) return;
      
      let msg = `🌅 *PRE-MARKET ALPHA REPORT*\n\n`;
      if (isPreOpenWindow) msg = `🔥 *FINAL PRE-OPEN ORDER BOOK CONFIRMATION*\n\n`;

      highConviction.forEach(p => {
        msg += `*${p.ticker}* (${p.catalystType})\n`;
        msg += `Conviction: ${p.conviction}/100\n`;
        msg += `Why: ${p.reasoning}\n\n`;
      });

      sendTelegram(msg);
      lastAlphaDate = todayDate;
    }

  } catch (error) {
    console.error('[PreMarket] Alpha Cycle Failed:', error);
  }
}
