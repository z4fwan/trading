import { NextRequest } from 'next/server';
import { addStreamClient, removeStreamClient } from '@/lib/sseManager';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  ensureBackgroundEngine();
  const id = Math.random().toString(36).slice(2, 10);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addStreamClient(id, controller);

      // Shorter heartbeat (15s vs 30s) for Render — detects dead clients faster
      const hb = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(': hb\n\n')); } catch { clearInterval(hb); }
      }, 15000);

      if (request.signal) {
        request.signal.addEventListener('abort', () => {
          clearInterval(hb);
          removeStreamClient(id);
        });
      }
    },
    cancel() {
      removeStreamClient(id);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
