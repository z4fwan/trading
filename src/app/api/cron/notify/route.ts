import { NextResponse } from 'next/server';
import { markWake, getEngineState } from '@/lib/engineState';
import { sendTelegramMessage } from '@/lib/newsTelegram';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

interface IstParts { time: string; date: string; weekday: string; minutes: number; }

function istParts(): IstParts {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const hh = get('hour').padStart(2, '0');
  const mm = get('minute').padStart(2, '0');
  return {
    time: `${hh}:${mm}`,
    date: `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`,
    weekday: get('weekday'),
    minutes: parseInt(hh, 10) * 60 + parseInt(mm, 10),
  };
}

function rel(ts: number): string {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

const dedupe = new Set<string>();

/** Under CUSTOM_SERVER the engine runs in a child process; its state arrives via IPC as __enginePayload. */
function readEngineState() {
  let engine = getEngineState();
  if (process.env.CUSTOM_SERVER === 'true') {
    const remote = (globalThis as Record<string, unknown>).__enginePayload;
    if (remote && typeof remote === 'string' && remote.length > 2) {
      try { engine = { ...engine, ...JSON.parse(remote) }; } catch { /* ignore */ }
    }
  }
  return engine;
}

/** Give the freshly-booted worker time to stream a payload that says it is running. */
async function waitForEngine(maxMs = 60000): Promise<boolean> {
  if (process.env.CUSTOM_SERVER !== 'true') return true;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const remote = (globalThis as Record<string, unknown>).__enginePayload;
    if (remote && typeof remote === 'string' && remote.length > 2) {
      try { if ((JSON.parse(remote) as { running?: boolean }).running) return true; } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** If the worker is still booting at wake time, send a follow-up once it goes live (usually <2 min). */
function scheduleReadyConfirmation(): void {
  const g = globalThis as Record<string, unknown>;
  if (g.__notifyReadyPoll) return;
  let ticks = 0;
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    ticks++;
    const st = readEngineState();
    if (st.running) {
      clearInterval(timer);
      g.__notifyReadyPoll = null;
      const now = istParts();
      void sendTelegramMessage([
        `✅ <b>ENGINE READY</b> — ${now.date}, ${now.time} IST`,
        `First cycle complete: <b>${st.predictionsStored ?? 0}</b> predictions`,
        `Cycles: ML ${rel(st.lastMLCycle)} · quotes ${rel(st.lastQuote)} · news ${rel(st.lastNewsCycle)}`,
      ].join('\n'));
    } else if (ticks >= 40) {
      clearInterval(timer);
      g.__notifyReadyPoll = null;
    }
  }, 3000);
  g.__notifyReadyPoll = timer;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const event = (searchParams.get('event') || '').toLowerCase();

  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }
  if (event !== 'wake' && event !== 'sleep') {
    return NextResponse.json({ ok: false, error: 'event must be wake or sleep' }, { status: 400 });
  }

  const ist = istParts();
  if (event === 'wake') await waitForEngine();
  const state = readEngineState();
  const uptimeMin = Math.floor(process.uptime() / 60);
  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = `${today}-${event}`;

  // Keep the server alive on the wake ping (weekdays, market window) — mirrors /api/cron/wake.
  if (event === 'wake' && ist.weekday !== 'Sat' && ist.weekday !== 'Sun' && typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).__lastCronWake = Date.now();
  }
  markWake(`notify-${event}`);

  const acc = state.selfAwareness?.overallAccuracy;
  const accLine = acc ? `${acc.toFixed(1)}%` : 'n/a';

  let text: string;
  if (event === 'wake') {
    if (state.running) {
      text = [
        `🌅 <b>ENGINE AWAKE</b> — ${ist.date}, ${ist.time} IST`,
        `Status: <b>RUNNING ✅</b> (up ${uptimeMin}m) — ${state.predictionsStored ?? 0} predictions this cycle`,
        `Cycles: ML ${rel(state.lastMLCycle)} · quotes ${rel(state.lastQuote)} · news ${rel(state.lastNewsCycle)}`,
        `Tracked momentum accuracy: ${accLine}`,
        `Today: open 09:15 · EOD resolve 15:45 · sleep ~19:00 IST`,
      ].join('\n');
    } else {
      text = [
        `🌅 <b>ENGINE AWAKE</b> — ${ist.date}, ${ist.time} IST`,
        `Status: <b>BOOTING 🔄</b> — cold start warming up (normal at wake).`,
        `A ✅ READY confirmation will follow once the first cycle completes.`,
        `Today: open 09:15 · EOD resolve 15:45 · sleep ~19:00 IST`,
      ].join('\n');
      scheduleReadyConfirmation();
    }
  } else {
    text = [
      `😴 <b>ENGINE SLEEP</b> — ${ist.date}, ${ist.time} IST`,
      `Free-tier window ended — sleeping until next wake ~06:00 IST.`,
      `Today: ${state.predictionsStored ?? 0} predictions | accuracy ${accLine}`,
      `Any missed events will be recovered automatically on the next wake.`,
    ].join('\n');
  }

  let sent = false;
  const duplicate = dedupe.has(dedupeKey);
  if (duplicate) {
    sent = true; // already notified this event today; treat as success, don't re-send
  } else {
    sent = await sendTelegramMessage(text);
    if (sent) dedupe.add(dedupeKey);
  }

  return NextResponse.json({
    ok: true, event, ist: ist.time, weekday: ist.weekday,
    sent, duplicate, uptime: Math.round(process.uptime()),
  });
}
