// Sandbox Broker Integration for Automated Execution

export type TradeDirection = 'BUY' | 'SELL';
export type TradeType = 'MARKET' | 'LIMIT';

export interface TradeOrder {
  ticker: string;
  direction: TradeDirection;
  quantity: number;
  type: TradeType;
  price?: number;
}

const IS_SANDBOX = true; // Hardcoded to true for safety

/**
 * Execute a trade on the configured broker API (e.g. Zerodha / Upstox).
 * Currently locked in SANDBOX mode to prevent financial loss.
 */
export async function executeTrade(order: TradeOrder): Promise<{ success: boolean; orderId?: string; message: string }> {
  console.log(`[Broker] Executing ${order.direction} ${order.quantity}x ${order.ticker} @ ${order.type}`);
  
  if (IS_SANDBOX) {
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

  // --- Real Integration Stub ---
  // const payload = { symbol: order.ticker, qty: order.quantity, side: order.direction };
  // const res = await fetch('https://api.kite.trade/orders/regular', { ... })
  // ...
  
  return { success: false, message: 'Real broker integration not configured' };
}
