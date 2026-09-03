import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

function getIstTime(): { hh: number; mm: number; mins: number; weekday: boolean } {
  const t = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const parts = t.split(' ');
  const day = parts[0];
  const time = parts.length > 1 ? parts[1] : parts[0];
  const [hh, mm] = (parts.length > 1 ? parts[1] : parts[0]).split(':').map(Number);
  const weekday = !['Sat', 'Sun'].includes(day);
  return { hh, mm, mins: hh * 60 + mm, weekday };
}

function isMarketHours(mins: number, weekday: boolean): boolean {
  if (!weekday) return false;
  return (mins >= 480 && mins <= 605) || (mins >= 900 && mins <= 990);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  const ist = getIstTime();
  const now = Date.now();

  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).__lastCronWake = now;
  }

  const inMarketHours = isMarketHours(ist.mins, ist.weekday);

  const response: Record<string, unknown> = {
    ok: true,
    timestamp: now,
    ist: `${String(ist.hh).padStart(2, '0')}:${String(ist.mm).padStart(2, '0')}`,
    weekday: ist.weekday,
    marketHours: inMarketHours,
    uptime: Math.round(process.uptime()),
  };

  if (!inMarketHours && ist.weekday) {
    if (ist.mins > 990) {
      response.action = 'post-market-window';
      response.note = 'Post-market hours. Server will stay alive for post-market review.';
    } else {
      response.action = 'pre-market-quiet';
      response.note = 'Pre-market quiet period. Server will auto-shutdown in ~10 min if no activity.';
    }
  } else if (!ist.weekday) {
    response.action = 'weekend';
    response.note = 'Weekend. Server will auto-shutdown in ~10 min if no activity.';
  } else {
    response.action = 'market-hours';
    response.note = 'Market hours. Keeping server alive.';
  }

  return NextResponse.json(response);
}
