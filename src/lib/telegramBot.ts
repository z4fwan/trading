import type { ClassifiedNewsItem } from './engineState';
import { executeTrade, type TradeDirection } from './brokerIntegration';
import type { MultibaggerPick } from './stockPulse/types';
import * as https from 'https';

function escapeHtml(unsafe?: string): string {
  return (unsafe || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function httpsPost(urlStr: string, bodyObj: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(bodyObj);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      timeout: 10000,
      family: 4, // Force IPv4 to prevent IPv6 timeouts on Render
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          console.warn(`[Telegram] HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
          resolve(null);
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(bodyStr);
    req.end();
  });
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const notifiedItems = new Set<string>();

export async function sendTelegramAlert(item: ClassifiedNewsItem): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  // Prevent duplicate notifications
  const hash = `${item.headline.slice(0, 30)}|${item.llmTradingSignal}`;
  if (notifiedItems.has(hash)) return;
  notifiedItems.add(hash);
  
  if (notifiedItems.size > 500) {
    const first = notifiedItems.keys().next().value;
    if (first) notifiedItems.delete(first);
  }

  // --- BROKER EXECUTION TRIGGER ---
  let executionStatus = '';
  if (item.llmTradingSignal === 'BUY' || item.llmTradingSignal === 'SELL') {
    const ticker = item.tickers[0];
    if (ticker) {
      const res = await executeTrade({
        ticker,
        direction: item.llmTradingSignal as TradeDirection,
        quantity: 1, // Sandbox default
        type: 'MARKET'
      });
      executionStatus = `\n<b>Auto-Execution:</b> ${res.success ? '✅ SUCCESS' : '❌ FAILED'} (${res.orderId || 'No ID'})`;
    }
  }

  const emoji = item.llmTradingSignal === 'BUY' ? '🚀' : item.llmTradingSignal === 'SELL' ? '⚠️' : '🔔';
  
  const timeStr = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  
  const text = `
${emoji} <b>${item.llmTradingSignal} SIGNAL DETECTED</b>
<b>Type:</b> ${item.llmEventType?.replace('_', ' ')}
<b>Tickers:</b> ${item.tickers.join(', ')}
<b>Time (IST):</b> ${timeStr}${executionStatus}

<b>Headline:</b> ${escapeHtml(item.headline)}

<b>AI Reasoning:</b> ${escapeHtml(item.llmReasoning)}

<b>Expected Move:</b> ${item.llmExpectedMovementPct || 'N/A'}
`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await httpsPost(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending alert:`, error);
  }
}

export async function sendStockPulseGemAlert(gem: MultibaggerPick): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  const hash = `GEM|${gem.ticker}|${gem.tier}`;
  if (notifiedItems.has(hash)) return;
  notifiedItems.add(hash);
  
  if (notifiedItems.size > 500) {
    const first = notifiedItems.keys().next().value;
    if (first) notifiedItems.delete(first);
  }

  const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  
  const text = `
💎 <b>STOCK PULSE GEM FOUND</b> 💎
<b>Ticker:</b> ${gem.ticker}
<b>Name:</b> ${escapeHtml(gem.name)}
<b>Tier:</b> ${gem.tier}
<b>Score:</b> ${gem.score}/100

<b>Time (IST):</b> ${timeStr}

<b>Analysis:</b>
${gem.reasons.map(r => `• ${escapeHtml(r)}`).join('\n')}

<i>Powered by DeepSeek Neural Fundamental Analyser</i>
`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await httpsPost(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending GEM alert:`, error);
  }
}

export async function sendTelegramMessage(text: string): Promise<{ message_id: number; chat_id: number | string } | null> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return null;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await httpsPost(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    });
    if (res?.ok && res.result?.message_id) {
      return { message_id: res.result.message_id, chat_id: res.result.chat.id };
    }
  } catch (error) {
    console.warn(`[Telegram] Error sending message:`, error);
  }
  return null;
}

export async function editTelegramMessage(chatId: number | string, messageId: number, newText: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    const res = await httpsPost(url, {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML'
    });
    return res?.ok === true;
  } catch (error) {
    console.warn(`[Telegram] Error editing message:`, error);
    return false;
  }
}
