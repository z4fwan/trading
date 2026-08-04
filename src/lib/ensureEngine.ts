import { getEngineState } from './engineState';
import { logEnvStatus } from './env';

let bootstrapping = false;

/** Start the 24/7 engine if instrumentation did not (e.g. edge path or cold serverless). */
export function ensureBackgroundEngine(): void {
  if (process.env.VERCEL) return;
  // Under the custom server (server.js) the dedicated ML worker thread already
  // runs the engine — starting a second one here causes dual polling, split
  // prediction state and .quantum_db.json write contention.
  if (process.env.CUSTOM_SERVER === 'true') return;
  const state = getEngineState();
  if (state.running) return;
  if (bootstrapping) return;
  bootstrapping = true;
  logEnvStatus();
  void import('./backgroundEngine')
    .then(({ startBackgroundEngine }) => {
      startBackgroundEngine();
    })
    .catch((e) => {
      console.warn('[ensureEngine] Failed to start background engine:', e);
    })
    .finally(() => {
      bootstrapping = false;
    });
}
