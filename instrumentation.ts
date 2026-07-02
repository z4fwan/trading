import { validateEnv } from './src/lib/env';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('[Instrumentation] Edge runtime — background engine starts on first API request');
    return;
  }

  const missing = validateEnv();
  if (missing.length > 0) {
    console.warn(`[Instrumentation] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[Instrumentation] App will start but auth/sync may be limited');
  }

  if (process.env.VERCEL) {
    console.log('[Instrumentation] Vercel detected — skipping background engine (serverless)');
    return;
  }

  const { startBackgroundEngine } = await import('./src/lib/backgroundEngine');
  startBackgroundEngine();
}
