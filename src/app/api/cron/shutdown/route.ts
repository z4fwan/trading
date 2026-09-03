import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = body?.reason || 'cron-shutdown';

  console.log(`[CronShutdown] Received shutdown request: ${reason}. Scheduling shutdown in 5s...`);

  setTimeout(() => {
    console.log('[CronShutdown] Executing graceful shutdown...');
    process.exit(0);
  }, 5000);

  return NextResponse.json({
    ok: true,
    message: `Shutdown scheduled in 5 seconds. Reason: ${reason}`,
    timestamp: Date.now(),
  });
}
