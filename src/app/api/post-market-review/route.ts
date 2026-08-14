import { NextResponse } from 'next/server';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { runPostMarketReview } from '@/lib/postMarketReview';
import { canAccessProtectedReport } from '@/lib/adminAuthServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(req: Request) {
  ensureBackgroundEngine();
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') === '1';

  if (isProduction && !canAccessProtectedReport(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Log in as admin, or send header x-report-secret (ANNUAL_REPORT_SECRET).' },
      { status: 401 },
    );
  }

  const result = await runPostMarketReview(force);
  return NextResponse.json({
    ok: true,
    message: result ?? 'No-op (already sent today, not a weekday, or before 16:00 IST). Use force=1 to override.',
  });
}
