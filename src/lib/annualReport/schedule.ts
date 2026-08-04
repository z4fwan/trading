import { collectAnnualReportData } from './collectData';
import { sendAnnualReportEmail, getReportHtmlForPreview } from './sendEmail';
import type { ReportKind } from './types';
import { getIndianFinancialYear } from './period';
import { getIstDateParts } from '@/lib/adminAuthServer';

const SENT_KEY = '__quantumAnnualReportSent';

type SentLog = { fy?: string; monthly?: string; lastDemo?: number };

function getSentLog(): SentLog {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[SENT_KEY]) g[SENT_KEY] = {};
  return g[SENT_KEY] as SentLog;
}

export async function generateAndSendReport(
  kind: ReportKind,
  options?: { recipient?: string; dryRun?: boolean; force?: boolean },
): Promise<{
  ok: boolean;
  kind: ReportKind;
  email?: string;
  send?: { ok: boolean; method?: string; error?: string; preview?: boolean };
  html?: string;
}> {
  const data = await collectAnnualReportData(kind, options?.recipient);
  const send = await sendAnnualReportEmail(data, { dryRun: options?.dryRun });
  const html = getReportHtmlForPreview(data);

  if (send.ok && !options?.dryRun) {
    const log = getSentLog();
    if (kind === 'financial_year') log.fy = data.period.financialYear || getIndianFinancialYear();
    if (kind === 'monthly') log.monthly = new Date().toISOString().slice(0, 7);
    if (kind === 'demo') log.lastDemo = Date.now();
  }

  return {
    ok: send.ok || !!options?.dryRun,
    kind,
    email: data.recipientEmail,
    send,
    html: options?.dryRun ? html : undefined,
  };
}

/** Call once per day from background engine (IST). */
export async function checkScheduledReports(): Promise<string | null> {
  const enabled = process.env.ANNUAL_REPORT_AUTO !== 'false';
  if (!enabled) return null;

  const { year, month, day } = getIstDateParts();
  const log = getSentLog();

  // 1 April IST — previous FY report
  if (month === 4 && day === 1 && process.env.ANNUAL_REPORT_FY_AUTO !== 'false') {
    const prevFyStart = year - 1;
    const fyLabel = `${prevFyStart}-${String(prevFyStart + 1).slice(-2)}`;
    if (log.fy !== fyLabel) {
      const res = await generateAndSendReport('financial_year');
      return res.send?.ok
        ? `FY report sent for ${fyLabel} → ${res.email}`
        : `FY report failed: ${res.send?.error}`;
    }
  }

  if (process.env.ANNUAL_REPORT_MONTHLY === 'true') {
    const lastDay = new Date(year, month, 0).getDate();
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    if (day === lastDay && log.monthly !== monthKey) {
      const res = await generateAndSendReport('monthly');
      return res.send?.ok
        ? `Monthly report sent → ${res.email}`
        : `Monthly report failed: ${res.send?.error}`;
    }
  }

  return null;
}
