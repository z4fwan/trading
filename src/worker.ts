import { startBackgroundEngine } from './lib/backgroundEngine';
import { getEngineState } from './lib/engineState';

console.log('[Worker] Starting Dedicated ML Background Engine...');
startBackgroundEngine();

let lastPayload = '';

// The worker continuously checks the engine state and forwards new price payloads
// to the Next.js parent process via IPC (Inter-Process Communication).
setInterval(() => {
    const payload = getEngineState().quotesPayload;
    if (payload && payload !== lastPayload) {
        lastPayload = payload;
        
        // Ensure we are running as a child process with IPC enabled
        if (process.send) {
            process.send({ type: 'QUOTE_PAYLOAD', data: payload });
        }
    }
}, 100);
