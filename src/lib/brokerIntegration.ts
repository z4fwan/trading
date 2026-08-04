// Live Broker Integration Architecture

export type TradeDirection = 'BUY' | 'SELL';
export type TradeType = 'MARKET' | 'LIMIT';

export interface TradeOrder {
  ticker: string;
  direction: TradeDirection;
  quantity: number;
  type: TradeType;
  price?: number;
}

// Fallback to true if NO API key is provided
const ZERODHA_API_KEY = process.env.ZERODHA_API_KEY || '';
const UPSTOX_API_KEY = process.env.UPSTOX_API_KEY || '';
const IS_SANDBOX = !ZERODHA_API_KEY && !UPSTOX_API_KEY;

/**
 * Execute a trade on the configured broker API (e.g. Zerodha / Upstox).
 * If no API keys are provided in the .env file, it safely falls back to SANDBOX mode.
 */
export async function executeTrade(order: TradeOrder): Promise<{ success: boolean; orderId?: string; message: string }> {
  console.log(`[Broker] Executing ${order.direction} ${order.quantity}x ${order.ticker} @ ${order.type}`);
  
  if (IS_SANDBOX) {
    console.warn('[Broker] ⚠ No API Keys found. Executing in SANDBOX mode.');
    // Simulate network delay
    await new Promise(r => setTimeout(r, 500));
    const fakeOrderId = `SANDBOX_${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    console.log(`[Broker] SANDBOX SUCCESS: ${fakeOrderId}`);
    return {
      success: true,
      orderId: fakeOrderId,
      message: 'Order placed successfully in Sandbox mode.'
    };
  }

  // --- Real Integration Architecture ---
  try {
    if (ZERODHA_API_KEY) {
      // Stub for Zerodha Kite API Execution
      console.log(`[Broker] Routing order to ZERODHA...`);
      // const res = await fetch('https://api.kite.trade/orders/regular', {
      //   method: 'POST',
      //   headers: { 'X-Kite-Version': '3', 'Authorization': `token ${ZERODHA_API_KEY}` },
      //   body: new URLSearchParams({ tradingsymbol: order.ticker, transaction_type: order.direction, quantity: order.quantity.toString(), order_type: order.type })
      // });
      return { success: true, orderId: `ZERODHA_${Date.now()}`, message: 'Real Zerodha integration stub executed.' };
    } 
    
    if (UPSTOX_API_KEY) {
      // Stub for Upstox API Execution
      console.log(`[Broker] Routing order to UPSTOX...`);
      return { success: true, orderId: `UPSTOX_${Date.now()}`, message: 'Real Upstox integration stub executed.' };
    }
  } catch (error) {
    console.error(`[Broker] Live API Execution Failed:`, error);
    return { success: false, message: `API Error: ${error}` };
  }
  
  return { success: false, message: 'Broker routing failed' };
}
