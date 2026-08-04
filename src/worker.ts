import { startBackgroundEngine } from './lib/backgroundEngine';
import { getEngineState } from './lib/engineState';

console.log('[Worker] Starting Dedicated ML Background Engine...');

// Hardened Production: Prevent global crashes from unhandled promises
process.on('uncaughtException', (err) => {
  console.error('[Worker CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
startBackgroundEngine();

import { runAutoIntradayScan } from './lib/autoIntradayScanner';
import { getIntradayCalls, getIntradayPlan } from './lib/intradayStore';
import { markIntradayCalls } from './lib/engineState';

let lastPayload = '';

process.on('message', async (msg: any) => {
  if (msg && msg.type === 'FORCE_INTRADAY') {
    console.log('[Worker] Received FORCE_INTRADAY command. Triggering scan...');
    try {
      await runAutoIntradayScan(true);
      const calls = getIntradayCalls();
      const plan = getIntradayPlan();
      markIntradayCalls(calls, plan);
      console.log('[Worker] Force scan complete. Broadcast updated state.');
    } catch (e) {
      console.error('[Worker] Force scan failed:', e);
    }
  }
});
let lastEnginePayloadStr = '';

// The worker continuously checks the engine state and forwards new price payloads
// to the Next.js parent process via IPC (Inter-Process Communication).
setInterval(() => {
    const state = getEngineState();
    const payload = state.quotesPayload;
    if (payload && payload !== lastPayload) {
        lastPayload = payload;
        
        // Ensure we are running as a child process with IPC enabled
        if (process.send) {
            process.send({ type: 'QUOTE_PAYLOAD', data: payload });
        }
    }
}, 100);

// Stream the full AI engine state (including predictions and quant signals) every 2 seconds
setInterval(() => {
    const state = getEngineState();
    // Exclude the huge raw quotesPayload from the engine state to save bandwidth (it's sent via QUOTE_PAYLOAD)
    const { quotesPayload, ...engineData } = state;
    const stateStr = JSON.stringify(engineData);
    if (stateStr !== lastEnginePayloadStr) {
        lastEnginePayloadStr = stateStr;
        if (process.send) {
            process.send({ type: 'ENGINE_PAYLOAD', data: stateStr });
        }
    }
}, 2000);
