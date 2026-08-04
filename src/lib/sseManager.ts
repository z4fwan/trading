// SSE Manager — broadcasts engine's cached quote payload to connected clients.
// Does NOT poll Yahoo Finance directly. Eliminates duplicate 1s fetch.
// Relies entirely on backgroundEngine.ts which stores payload via markQuote().
// Single source of truth: one SSE endpoint, one broadcast loop, zero external fetches.
// Deduplicates payload but force-rebroadcasts every 5s so clients never stall.

import { getEngineState, markSSEClients } from './engineState';

type SSEController = ReadableStreamDefaultController<Uint8Array>;
const clients = new Map<string, SSEController>();
const encoder = new TextEncoder();
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let lastPayload = '';
let lastBroadcastAt = 0;

function broadcast(): void {
  const engine = getEngineState();

  // @ts-expect-error global scope augmentation not fully typed
  const payload = global.__quotesPayload || engine.quotesPayload;
  if (!payload) return;
  const now = Date.now();
  // Skip if payload unchanged AND we sent one within the last 5s
  if (payload === lastPayload && now - lastBroadcastAt < 5000) return;
  lastPayload = payload;
  lastBroadcastAt = now;
  const msg = `event: quote\ndata: ${payload}\n\n`;
  const encoded = encoder.encode(msg);
  const deadIds: string[] = [];
  for (const [id, controller] of clients) {
    try { controller.enqueue(encoded); }
    catch { deadIds.push(id); }
  }
  for (const id of deadIds) clients.delete(id);

  // Removed dangerous WebSocket broadcasting hack.
  // WebSockets are now handled exclusively by server.js via IPC from the background worker.

  if (clients.size === 0 && broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
}

export function addStreamClient(id: string, controller: SSEController): void {
  clients.set(id, controller);
  markSSEClients(clients.size);
  if (clients.size === 1) {
    const intervalMs = process.env.RENDER === 'true' ? 200 : 100;
    broadcastTimer = setInterval(broadcast, intervalMs);
    broadcast();
  }
}

export function removeStreamClient(id: string): void {
  clients.delete(id);
  markSSEClients(clients.size);
  if (clients.size === 0 && broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
}
