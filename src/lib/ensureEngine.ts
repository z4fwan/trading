import { getEngineState } from './engineState';

let bootstrapping = false;

/** Start the 24/7 engine if instrumentation did not (e.g. edge path or cold serverless). */
export function ensureBackgroundEngine(): void {
  if (process.env.VERCEL) return;
  const state = getEngineState();
  if (state.running) return;
  if (bootstrapping) return;
  bootstrapping = true;
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
