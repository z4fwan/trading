import type { ClassifiedNewsItem } from './engineState';
import { getEngineState } from './engineState';
import { executeTrade, type TradeDirection } from './brokerIntegration';
import type { MultibaggerPick } from './stockPulse/types';
import { getMarketBadge, isIndianTicker } from './marketConfig';
import * as https from 'https';

function escapeHtml(unsafe?: string): string {
  return (unsafe || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function httpsGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, { family: 4, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
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
const TELEGRAM_BOT_TOKEN_GLOBAL = process.env.TELEGRAM_BOT_TOKEN_GLOBAL;
const TELEGRAM_CHAT_ID_GLOBAL = process.env.TELEGRAM_CHAT_ID_GLOBAL;

const notifiedItems = new Set<string>();

function getBotCredentials(ticker?: string, explicitMarket?: string): { token: string | undefined, chatId: string | undefined } {
  // If explicitly requested global, or if ticker is globally identified, use global bot (if configured)
  const isGlobal = explicitMarket === 'GLOBAL' || (ticker && !isIndianTicker(ticker));
  if (isGlobal && TELEGRAM_BOT_TOKEN_GLOBAL && TELEGRAM_CHAT_ID_GLOBAL) {
    return { token: TELEGRAM_BOT_TOKEN_GLOBAL, chatId: TELEGRAM_CHAT_ID_GLOBAL };
  }
  // Default to Indian/Primary bot
  return { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
}

export async function sendTelegramAlert(item: ClassifiedNewsItem): Promise<void> {
  // Disabled: The FastAPI V7 backend now handles all Telegram alerting.
  return;
  
  // Prevent duplicate notifications
  const hash = `${item.headline.slice(0, 30)}|${item.llmTradingSignal}`;
  if (notifiedItems.has(hash)) return;
  notifiedItems.add(hash);
  
  if (notifiedItems.size > 500) {
    const first = notifiedItems.values().next().value;
    if (first != null) notifiedItems.delete(first as string);
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
  const marketBadge = item.region ? getMarketBadge(item.region) : getMarketBadge(item.tickers[0] || '');
  
  const timeStr = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const priceDisplay = item.tickers.length > 0 ? `💰 <b>Price at Alert:</b> <code>Check Terminal</code>\n` : '';
  
  const text = `
[${marketBadge} MARKET] ${emoji} <b>${item.llmTradingSignal} SIGNAL DETECTED</b>
<b>Type:</b> ${item.llmEventType?.replace('_', ' ')}
<b>Tickers:</b> ${item.tickers.join(', ')}
${priceDisplay}🕒 <b>Time (IST):</b> ${timeStr}${executionStatus}

<b>Headline:</b> ${escapeHtml(item.headline)}

<b>AI Reasoning:</b> ${escapeHtml(item.llmReasoning)}

<b>Expected Move:</b> ${item.llmExpectedMovementPct || 'N/A'}
`;

  const { token, chatId } = getBotCredentials(item.tickers[0]);
  if (!token || !chatId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending alert:`, error);
  }
}

export async function sendStockPulseGemAlert(gem: MultibaggerPick): Promise<void> {
  // DEPRECATED in V5: All Telegram alerts are now sent centrally by the Python V5 Engine.
  return;
  
  const { token, chatId } = getBotCredentials(gem.ticker);
  if (!token || !chatId) return;
  
  const hash = `GEM|${gem.ticker}|${gem.tier}`;
  if (notifiedItems.has(hash)) return;
  notifiedItems.add(hash);
  
  if (notifiedItems.size > 500) {
    const first = notifiedItems.values().next().value;
    if (first != null) notifiedItems.delete(first as string);
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
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending GEM alert:`, error);
  }
}

export async function sendTelegramMessage(text: string, explicitMarket?: string): Promise<{ message_id: number; chat_id: number | string } | null> {
  // Disabled: The FastAPI V7 backend now handles all Telegram alerting.
  return null;

  let token = TELEGRAM_BOT_TOKEN;
  let chatId = TELEGRAM_CHAT_ID;

  // Guess market from text if explicitMarket is not provided
  if (!explicitMarket) {
    if (text.includes('[GLOBAL MARKET]') || text.includes('[US MARKET]')) explicitMarket = 'GLOBAL';
    else if (text.includes('[IN MARKET]')) explicitMarket = 'IN';
  }

  const creds = getBotCredentials(undefined, explicitMarket);
  if (creds.token && creds.chatId) {
    token = creds.token;
    chatId = creds.chatId;
  }

  if (!token || !chatId) return null;
  
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await httpsPost(url, {
      chat_id: chatId,
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

const IMPORTANT_EVENT_TYPES = ['ORDER_WIN', 'TURNAROUND', 'DEBT_REDUCTION', 'FUND_RAISING', 'EARNINGS_BEAT', 'EARNINGS_MISS', 'FDA_APPROVAL'];

function isActionableSignal(signal: string): boolean {
  return ['BUY', 'SELL', 'STRONG_BUY', 'STRONG_SELL', 'PULLBACK'].includes(signal);
}

export async function sendAnnouncementAlert(announcement: {
  id: string;
  symbol: string;
  company: string;
  headline: string;
  category: string;
  ai_analysis?: { event_type?: string; trading_signal?: string; expected_movement_pct?: string };
  prediction?: { direction?: string; momentum_score?: number };
}): Promise<void> {
  const { token, chatId } = getBotCredentials(announcement.symbol);
  if (!token || !chatId) return;

  const cat = announcement.ai_analysis?.event_type || announcement.category || 'ALERT';
  const signal = announcement.ai_analysis?.trading_signal || announcement.prediction?.direction || 'NEUTRAL';

  // Only send actionable signals or important event types
  if (!isActionableSignal(signal) && !IMPORTANT_EVENT_TYPES.includes(cat)) return;

  const hash = `ANN|${announcement.id}`;
  if (notifiedItems.has(hash)) return;
  notifiedItems.add(hash);

  if (notifiedItems.size > 500) {
    const first = notifiedItems.values().next().value;
    if (first != null) notifiedItems.delete(first as string);
  }

  const emoji = signal === 'BUY' || signal === 'STRONG_BUY' ? '🟢' : signal === 'SELL' || signal === 'STRONG_SELL' ? '🔴' : '🔵';
  const marketBadge = getMarketBadge(announcement.symbol);
  const movePct = announcement.ai_analysis?.expected_movement_pct || 'N/A';
  const score = announcement.prediction?.momentum_score ?? 'N/A';

  const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const text = `
[${marketBadge} MARKET] ${emoji} <b>CORPORATE ANNOUNCEMENT</b>
<b>${announcement.symbol}</b> — ${announcement.company}
💰 <b>Price at Alert:</b> <code>Check Terminal</code>
🕒 <b>Time (IST):</b> ${timeStr}

<b>Type:</b> ${cat.replace(/_/g, ' ')}
<b>Signal:</b> ${signal} ${movePct !== 'N/A' ? `| Expected: ${movePct}` : ''} ${score !== 'N/A' ? `| Score: ${score}` : ''}

<b>Headline:</b> ${escapeHtml(announcement.headline)}
`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending announcement alert:`, error);
  }
}

export async function editTelegramMessage(chatId: number | string, messageId: number, newText: string): Promise<boolean> {
  // Determine token based on chatId
  let token = TELEGRAM_BOT_TOKEN;
  if (chatId.toString() === TELEGRAM_CHAT_ID_GLOBAL?.toString()) {
    token = TELEGRAM_BOT_TOKEN_GLOBAL;
  }
  
  if (!token) return false;
  try {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
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

export async function sendIntradayCandidateAlert(call: {
  ticker: string; name: string; direction: 'BULLISH' | 'BEARISH';
  confidence: number; entryPrice: number; currentPrice: number;
  targetPrice: number; stopLoss: number; predictedReturnPct: number;
  riskReward: number; reasoning: string[]; keyFactors: string[];
  patterns?: { name: string; signal: string; strength: number; description: string }[];
  rsi?: number; volume?: number; changePercent?: number;
}): Promise<void> {
  const { token, chatId } = getBotCredentials(call.ticker);
  if (!token || !chatId) return;

  const emoji = call.direction === 'BULLISH' ? '🟢' : '🔴';
  const signal = call.direction === 'BULLISH' ? 'BUY' : 'SELL';
  const confBar = '█'.repeat(Math.round(call.confidence / 10)) + '░'.repeat(10 - Math.round(call.confidence / 10));
  const marketBadge = getMarketBadge(call.ticker);

  const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  let text = `
[${marketBadge} MARKET] ${emoji} <b>INTRADAY TRADE ALERT</b>
<b>${call.ticker}</b> — ${call.name} | ${signal} (${call.confidence}%)
${confBar} ${call.confidence}%

💰 <b>Price at Alert:</b> <code>₹${call.currentPrice}</code>
🕒 <b>Time (IST):</b> ${timeStr}

<b>Prices:</b>
Entry: ₹${call.entryPrice} → Target: ₹${call.targetPrice} | Stop: ₹${call.stopLoss}
Return: ${call.predictedReturnPct >= 0 ? '+' : ''}${call.predictedReturnPct}% | R/R: ${call.riskReward}`;

  if (call.changePercent !== undefined) {
    text += `\nChange: ${call.changePercent >= 0 ? '+' : ''}${call.changePercent.toFixed(2)}%`;
  }

  if (call.patterns && call.patterns.length > 0) {
    const topPattern = call.patterns.slice(0, 2);
    text += `\n\n<b>Candlestick Patterns:</b>`;
    for (const p of topPattern) {
      const pEmoji = p.signal === 'BULLISH' ? '🟢' : p.signal === 'BEARISH' ? '🔴' : '⚪';
      text += `\n${pEmoji} ${p.name} (${'★'.repeat(p.strength)}${'☆'.repeat(5 - p.strength)})`;
    }
  }

  if (call.rsi !== undefined) {
    const rsiEmoji = call.rsi > 70 ? '🟣' : call.rsi < 30 ? '🔵' : '⚪';
    text += `\n\n<b>Technical:</b> RSI ${rsiEmoji} ${call.rsi.toFixed(1)}`;
  }

  text += `\n\n<b>AI Analysis:</b>`;
  const reasons = [...(call.reasoning || []), ...(call.keyFactors || [])];
  for (const r of reasons.slice(0, 4)) {
    text += `\n• ${escapeHtml(r)}`;
  }

  text += `\n\n#${call.ticker} #${signal} #INTRADAY`;



  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.warn(`[Telegram] Error sending intraday alert:`, error);
  }
}

export async function sendPreMarketMomentumReport(
  picks: { ticker: string; name: string; entry: number; target: number; stop: number; gapPct: number; score: number; signals: string[] }[],
  window: 'PRE_OPEN' | 'POST_OPEN' | 'RE_SCAN',
  stats: { resolved: number; hits: number; ok: number; wrong: number; winRate: number },
): Promise<void> {
  const { token, chatId } = getBotCredentials(undefined, 'IN');
  if (!token || !chatId || picks.length === 0) return;

  const headline = window === 'PRE_OPEN'
    ? '🔥 *FINAL PRE-OPEN ORDER BOOK CONFIRMATION*'
    : window === 'RE_SCAN'
      ? '⚡ *LATE-BREAKOUT RESCAN — NEW MOMENTUM CATCHES*'
      : '🔥 *OPEN CONFIRMATION — MOMENTUM PICKS HOLDING*';

  const track = stats.resolved > 0
    ? `\n📊 Track record: ${stats.hits + stats.ok}/${stats.resolved} wins (${(stats.winRate * 100).toFixed(0)}%)`
    : '\n📊 Track record: calibrating (no resolved picks yet)';

  let text = `${headline}\n══════════════════════\nLong-only gap-and-go candidates confirmed from the NSE pre-open order book${track}\n`;

  picks.forEach((p, i) => {
    text += `\n${i + 1}. <b>${p.ticker}</b> — ${p.name}\n`;
    text += `Conviction: <b>${p.score}/100</b>\n`;
    text += `Why: ${p.signals.join(', ')}\n`;
    text += `Entry: <code>₹${p.entry}</code> → Target: <code>₹${p.target}</code> | Stop: <code>₹${p.stop}</code>\n`;
    text += `   #${p.ticker} #BUY #MOMENTUM\n`;
  });

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, { chat_id: chatId, text, parse_mode: 'HTML' });
  } catch (error) {
    console.warn(`[Telegram] Error sending pre-market momentum report:`, error);
  }
}

export async function sendRealtimePredictionAlert(alert: {
  ticker: string; name: string; direction: 'BULLISH' | 'BEARISH';
  probability: number; confidence: number; price: number; changePercent: number;
  trigger: string; detail: string; ts: number; model?: string;
}): Promise<void> {
  const { token, chatId } = getBotCredentials(alert.ticker);
  if (!token || !chatId) return;
  const emoji = alert.direction === 'BULLISH' ? '🟢' : '🔴';
  const signal = alert.direction === 'BULLISH' ? 'BUY' : 'SELL';
  const marketBadge = getMarketBadge(alert.ticker);
  const timeStr = new Date(alert.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  // When the ML probability contradicts the headline sentiment the alert is a
  // catalyst read, not a market call — say so instead of printing "BUY" while
  // the ML line right below says the stock is heading down.
  const conflict = (alert.direction === 'BULLISH' && alert.probability < 50) ||
                   (alert.direction === 'BEARISH' && alert.probability >= 50);
  const signalLabel = conflict
    ? `${signal} — ML DISAGREES (news-driven)`
    : signal;
  const text = `\n[${marketBadge} MARKET] ${emoji} ⚡ <b>REALTIME AI PREDICTION</b>
<b>${alert.ticker}</b> — ${alert.name} | <b>${signalLabel}</b> (${alert.confidence}%)

🎯 <b>Trigger:</b> ${escapeHtml(alert.detail)}
🧠 <b>ML Probability:</b> ${alert.probability >= 50 ? 'up' : 'down'} ${alert.probability}%
💰 <b>Price:</b> <code>₹${alert.price}</code> (${alert.changePercent >= 0 ? '+' : ''}${alert.changePercent.toFixed(2)}% day)
🕒 <b>Time (IST):</b> ${timeStr}${alert.model ? `\n📦 <b>Model:</b> ${alert.model}` : ''}

#${alert.ticker} #${signal} #REALTIME`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await httpsPost(url, { chat_id: chatId, text, parse_mode: 'HTML' });
  } catch (error) {
    console.warn(`[Telegram] Error sending realtime alert:`, error);
  }
}

export async function sendAICandidateAlert(result: { ticker: string; direction: string; confidence: number; entryPrice: number; targetPrice: number; reasoning: string[] }): Promise<void> {
  const { token, chatId } = getBotCredentials(result.ticker);
  if (!token || !chatId) return;
  const dirEmoji = result.direction === 'BULLISH' ? '🟢' : '🔴';
  const marketBadge = getMarketBadge(result.ticker);
  const text = `[${marketBadge} MARKET] ${dirEmoji} <b>AI Candidate</b>\n${result.ticker} — ${result.direction} (${result.confidence}%)\nEntry: ₹${result.entryPrice} | Target: ₹${result.targetPrice}\n\n${result.reasoning.slice(0, 3).map(r => `• ${escapeHtml(r)}`).join('\n')}`;
  await sendTelegramMessage(text);
}

let telegramListenerStarted = false;
let lastUpdateId = 0;

export function startTelegramBotListener() {
  if (!TELEGRAM_BOT_TOKEN) return;
  if (telegramListenerStarted) return;
  telegramListenerStarted = true;
  console.log('[Telegram] Started interactive bot listener');

  const poll = async () => {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
      const res = await httpsGet(url);
      if (res && res.ok && res.result) {
        for (const update of res.result) {
          if (update.update_id > lastUpdateId) {
            lastUpdateId = update.update_id;
          }
          if (update.message && update.message.text) {
            await handleTelegramCommand(update.message);
          }
        }
      }
    } catch (e) {
      console.warn('[Telegram] Polling error:', e);
    }
    setTimeout(poll, 1000);
  };
  
  poll();
}

async function handleTelegramCommand(message: any) {
  const text = message.text.trim();
  const chatId = message.chat.id;
  if (!text.startsWith('/')) return; // ignore non-commands

  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  let reply = '';

  try {
    if (cmd === '/quote') {
      if (!args[0]) {
        reply = '❌ Please provide a ticker: /quote RELIANCE';
      } else {
        const ticker = args[0].toUpperCase();
        const state = getEngineState();
        let q: any = null;
        if (state.quotesPayload) {
          try {
            const parsed = JSON.parse(state.quotesPayload);
            q = parsed[ticker];
          } catch (e) {}
        }

        if (q && q.price > 0) {
          const change = q.change || 0;
          const changePercent = q.changePercent || 0;
          const sign = change >= 0 ? '+' : '';
          const emoji = change >= 0 ? '🟢' : '🔴';
          reply = `${emoji} <b>${ticker}</b>\nPrice: ${q.price}\nChange: ${sign}${changePercent.toFixed(2)}%`;
        } else {
          reply = `❌ Could not fetch live price for ${ticker}`;
        }
      }
    } else if (cmd === '/momentum') {
      const state = getEngineState();
      reply = `🔥 <b>Engine Status</b>\nMemory: ${state.memoryMB}MB\nActive Fetches: ${state.activeFetches}`;
    } else if (cmd === '/status') {
      const state = getEngineState();
      reply = `⚙️ <b>Engine Status</b>\nMemory: ${state.memoryMB}MB\nRunning: ${state.running}\nLast Quote: ${new Date(state.lastQuote).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    } else if (cmd === '/help' || cmd === '/start') {
      reply = `🤖 <b>Trading AI Bot</b>\n\nCommands:\n/quote &lt;ticker&gt; - Live price\n/status - Engine health\n/help - Show this message`;
    } else {
      reply = `❌ Unknown command. Try /help`;
    }
  } catch (e) {
    reply = `❌ Error executing command.`;
  }

  if (reply) {
    await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply,
      parse_mode: 'HTML'
    });
  }
}
