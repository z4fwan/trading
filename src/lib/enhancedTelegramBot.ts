/**
 * Enhanced Telegram Bot - Institutional Grade Notifications
 * 
 * Provides detailed, actionable trading alerts with full context
 * including evidence scores, technical confirmation, and risk assessment.
 */

import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let bot: TelegramBot | null = null;

if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

export interface EnhancedTradeSignal {
  ticker: string;
  companyName?: string;
  eventType: string;
  sentiment: 'BULLISH' | 'BEARISH';
  probability: number;
  confidence: 'High' | 'Medium' | 'Low';
  reliability: 'A' | 'B' | 'C';
  signal: string;
  headline: string;
  source: string;
  timestamp: number;
  
  // V2 Enhanced Data
  evidenceScore?: number;
  tradeQuality?: string;
  suggestedHolding?: string;
  scoreBreakdown?: {
    newsScore: number;
    technicalScore: number;
    historicalScore: number;
    volumeScore: number;
  };
  
  // Technical Context
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  rsi?: number;
  volume?: number;
  relativeVolume?: number;
  
  // Risk Assessment
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  stopLoss?: number;
  targetPrice?: number;
  
  // Historical Context
  historicalMatches?: number;
  historicalWinRate?: number;
  avgMove?: number;
}

/**
 * Format an enhanced Telegram message with full institutional context
 */
function formatEnhancedMessage(signal: EnhancedTradeSignal): string {
  const signalIcon = signal.sentiment === 'BULLISH' ? '🟢' : '🔴';
  const signalText = signal.sentiment === 'BULLISH' ? 'BUY' : 'SELL';
  const qualityBadge = signal.tradeQuality ? `| Quality: ${signal.tradeQuality}` : '';
  
  // Evidence score visualization
  const evidenceBar = signal.evidenceScore ? 
    '█'.repeat(Math.round(signal.evidenceScore / 10)) + '░'.repeat(10 - Math.round(signal.evidenceScore / 10)) : '';
  
  // Time formatting
  const time = new Date(signal.timestamp).toLocaleTimeString('en-IN', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  });
  
  // Build message
  let msg = `${signalIcon} *VERIFIED HIGH IMPACT EVENT* ${qualityBadge}\n\n`;
  
  // Ticker and Signal
  msg += `*${signal.ticker}* | ${signalText} | Prob: ${signal.probability}%\n`;
  msg += `Event: ${signal.eventType} | Conf: ${signal.confidence} | Rel: ${signal.reliability}\n\n`;
  
  // Headline
  msg += `📰 *${signal.headline}*\n\n`;
  
  // Source and Time
  msg += `🔍 Source: *${signal.source}* | ⏰ ${time}\n`;
  
  // Evidence Score
  if (signal.evidenceScore !== undefined) {
    msg += `📊 Evidence: [${evidenceBar}] ${signal.evidenceScore}/100\n`;
  }
  
  // Price Context
  if (signal.currentPrice !== undefined) {
    const changeIcon = (signal.priceChange || 0) >= 0 ? '▲' : '▼';
    const changeColor = (signal.priceChange || 0) >= 0 ? '+' : '';
    msg += `💰 Price: ₹${signal.currentPrice.toFixed(2)} ${changeIcon} ${changeColor}${signal.priceChangePercent?.toFixed(2)}%\n`;
  }
  
  // Technical Context
  if (signal.rsi !== undefined) {
    const rsiStatus = signal.rsi > 70 ? '🔥 Overbought' : signal.rsi < 30 ? '❄️ Oversold' : '➡️ Neutral';
    msg += `📈 RSI: ${signal.rsi.toFixed(0)} ${rsiStatus}\n`;
  }
  
  if (signal.relativeVolume !== undefined && signal.relativeVolume > 0) {
    msg += `📊 Volume: ${signal.relativeVolume.toFixed(1)}x avg\n`;
  }
  
  // Score Breakdown
  if (signal.scoreBreakdown) {
    msg += `\n*Score Breakdown:*\n`;
    msg += `  News: ${signal.scoreBreakdown.newsScore} | Tech: ${signal.scoreBreakdown.technicalScore}\n`;
    msg += `  Hist: ${signal.scoreBreakdown.historicalScore} | Vol: ${signal.scoreBreakdown.volumeScore}\n`;
  }
  
  // Historical Context
  if (signal.historicalMatches !== undefined && signal.historicalMatches > 0) {
    msg += `\n*Historical Context:*\n`;
    msg += `  Matches: ${signal.historicalMatches} | Win Rate: ${signal.historicalWinRate?.toFixed(1)}%\n`;
    if (signal.avgMove !== undefined) {
      msg += `  Avg Move: ${signal.avgMove >= 0 ? '+' : ''}${signal.avgMove.toFixed(1)}%\n`;
    }
  }
  
  // Risk Assessment
  if (signal.riskLevel) {
    const riskIcon = signal.riskLevel === 'LOW' ? '🟢' : signal.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
    msg += `\n⚠️ Risk: ${riskIcon} ${signal.riskLevel}\n`;
  }
  
  // Suggested Holding
  if (signal.suggestedHolding) {
    const holdingMap: Record<string, string> = {
      'INTRADAY': '⚡ Intraday',
      'SWING_2_5_DAYS': '📅 2-5 Days',
      'SWING_1_2_WEEKS': '📅 1-2 Weeks',
      'LONG_TERM': '📈 Long Term'
    };
    msg += `⏱️ Holding: ${holdingMap[signal.suggestedHolding] || signal.suggestedHolding}\n`;
  }
  
  // Targets
  if (signal.targetPrice !== undefined) {
    msg += `🎯 Target: ₹${signal.targetPrice.toFixed(2)}\n`;
  }
  if (signal.stopLoss !== undefined) {
    msg += `🛑 Stop Loss: ₹${signal.stopLoss.toFixed(2)}\n`;
  }
  
  // Footer
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Quantum Alpha AI | Institutional Grade_`;
  
  return msg;
}

/**
 * Send enhanced trade signal to Telegram
 */
export async function sendEnhancedTelegramSignal(signal: EnhancedTradeSignal): Promise<any> {
  if (!bot || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Bot not configured, skipping notification');
    return null;
  }
  
  try {
    const message = formatEnhancedMessage(signal);
    const result = await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    
    console.log(`[Telegram] Signal sent: ${signal.ticker} ${signal.signal}`);
    return result;
  } catch (error) {
    console.error('[Telegram] Error sending signal:', error);
    return null;
  }
}

/**
 * Send urgent market shock alert
 */
export async function sendMarketShockAlert(
  headline: string,
  severity: 'HIGH' | 'MEDIUM' | 'LOW',
  source: string
): Promise<any> {
  if (!bot || !TELEGRAM_CHAT_ID) return null;
  
  const severityIcon = severity === 'HIGH' ? '🚨' : severity === 'MEDIUM' ? '⚠️' : 'ℹ️';
  const time = new Date().toLocaleTimeString('en-IN', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  });
  
  const message = `${severityIcon} *MARKET SHOCK ALERT*\n\n` +
    `📰 ${headline}\n\n` +
    `🔍 Source: *${source}*\n` +
    `⏰ ${time}\n\n` +
    `_Quantum Alpha AI | Market Intelligence_`;
  
  try {
    return await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('[Telegram] Error sending shock alert:', error);
    return null;
  }
}

/**
 * Send daily summary report
 */
export async function sendDailySummary(data: {
  totalSignals: number;
  successfulTrades: number;
  accuracy: number;
  topPerformers: Array<{ ticker: string; gain: number }>;
}): Promise<any> {
  if (!bot || !TELEGRAM_CHAT_ID) return null;
  
  const date = new Date().toLocaleDateString('en-IN', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
  
  let message = `📊 *DAILY TRADING SUMMARY*\n`;
  message += `📅 ${date}\n\n`;
  
  message += `*Performance:*\n`;
  message += `  Total Signals: ${data.totalSignals}\n`;
  message += `  Successful: ${data.successfulTrades}\n`;
  message += `  Accuracy: ${data.accuracy.toFixed(1)}%\n\n`;
  
  if (data.topPerformers.length > 0) {
    message += `*Top Performers:*\n`;
    data.topPerformers.slice(0, 5).forEach((p, i) => {
      message += `  ${i + 1}. ${p.ticker}: ${p.gain >= 0 ? '+' : ''}${p.gain.toFixed(1)}%\n`;
    });
  }
  
  message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  message += `_Quantum Alpha AI | Daily Report_`;
  
  try {
    return await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('[Telegram] Error sending daily summary:', error);
    return null;
  }
}

/**
 * Send institutional flow alert (FII/DII activity)
 */
export async function sendInstitutionalFlowAlert(data: {
  ticker: string;
  flowType: 'FII_BUYING' | 'FII_SELLING' | 'DII_BUYING' | 'DII_SELLING' | 'PROMOTER_BUYING' | 'PROMOTER_SELLING';
  amount?: number;
  percentChange?: number;
}): Promise<any> {
  if (!bot || !TELEGRAM_CHAT_ID) return null;
  
  const flowIcons: Record<string, string> = {
    'FII_BUYING': '🟢',
    'FII_SELLING': '🔴',
    'DII_BUYING': '🟢',
    'DII_SELLING': '🔴',
    'PROMOTER_BUYING': '💚',
    'PROMOTER_SELLING': '❤️‍🔥',
  };
  
  const flowLabels: Record<string, string> = {
    'FII_BUYING': 'FII Buying',
    'FII_SELLING': 'FII Selling',
    'DII_BUYING': 'DII Buying',
    'DII_SELLING': 'DII Selling',
    'PROMOTER_BUYING': 'Promoter Buying',
    'PROMOTER_SELLING': 'Promoter Selling',
  };
  
  const icon = flowIcons[data.flowType] || '📊';
  const label = flowLabels[data.flowType] || data.flowType;
  
  let message = `${icon} *INSTITUTIONAL FLOW ALERT*\n\n`;
  message += `*${data.ticker}*\n`;
  message += `Activity: ${label}\n`;
  
  if (data.percentChange !== undefined) {
    message += `Change: ${data.percentChange >= 0 ? '+' : ''}${data.percentChange.toFixed(2)}%\n`;
  }
  if (data.amount !== undefined) {
    message += `Amount: ₹${(data.amount / 100000).toFixed(2)} Cr\n`;
  }
  
  message += `\n_Quantum Alpha AI | Institutional Intelligence_`;
  
  try {
    return await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('[Telegram] Error sending institutional flow alert:', error);
    return null;
  }
}

export default {
  sendEnhancedTelegramSignal,
  sendMarketShockAlert,
  sendDailySummary,
  sendInstitutionalFlowAlert,
};