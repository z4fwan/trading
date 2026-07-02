import { NextResponse } from 'next/server';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { generateAndSendReport } from '@/lib/annualReport/schedule';
import { collectAnnualReportData } from '@/lib/annualReport/collectData';
import { getReportHtmlForPreview } from '@/lib/annualReport/sendEmail';
import { canAccessProtectedReport } from '@/lib/adminAuthServer';
import type { ReportKind } from '@/lib/annualReport/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(req: Request) {
  ensureBackgroundEngine();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'preview';
  const kind = (searchParams.get('kind') || 'demo') as ReportKind;
  const send = searchParams.get('send') === '1';
  const email = searchParams.get('email') || undefined;

  if (isProduction && !canAccessProtectedReport(req)) {
    return NextResponse.json(
      {
        error: 'Unauthorized. Log in as admin, or send header x-report-secret (ANNUAL_REPORT_SECRET).',
      },
      { status: 401 },
    );
  }

  if (action === 'preview' || (action === 'demo' && !send)) {
    const data = await collectAnnualReportData(kind, email);
    const html = getReportHtmlForPreview(data);
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (action === 'demo' || action === 'send') {
    const result = await generateAndSendReport(kind, {
      recipient: email,
      dryRun: !send,
    });
    return NextResponse.json({
      ...result,
      hint: send
        ? 'Check inbox (and spam). Needs GMAIL_USER + GMAIL_APP_PASSWORD on server.'
        : 'Add send=1 to email. Preview: action=preview',
    });
  }

  return NextResponse.json({
    usage: {
      preview: '/api/annual-report?action=preview&kind=demo',
      sendDemo:
        '/api/annual-report?action=demo&send=1 (login as admin or x-report-secret header)',
      sendFy: '/api/annual-report?action=send&kind=financial_year&send=1',
    },
  });
}

export async function POST(req: Request) {
  if (!canAccessProtectedReport(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { kind?: ReportKind; email?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  ensureBackgroundEngine();
  const result = await generateAndSendReport(body.kind || 'demo', {
    recipient: body.email,
    dryRun: body.dryRun,
  });
  return NextResponse.json(result);
}
