import type { AnnualReportData } from './types';
import { renderAnnualReportHtml } from './renderReport';

export interface SendReportResult {
  ok: boolean;
  method?: string;
  error?: string;
  preview?: boolean;
}

/** Send HTML report via Resend HTTP API (no extra npm package). */
async function sendViaResend(to: string, subject: string, html: string): Promise<SendReportResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Quantum Alpha <onboarding@resend.dev>';

  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (body as { message?: string }).message || `Resend HTTP ${res.status}` };
  }
  return { ok: true, method: 'resend' };
}

/** Gmail / SMTP via fetch to Brevo-style or use nodemailer if SMTP_* set — lightweight SMTP using native socket is heavy; prefer Resend + Gmail forwarding doc.

For Gmail App Password, we use a minimal SMTP sender without nodemailer using child process curl — actually install nodemailer is cleaner.

*/
async function sendViaSmtp(to: string, subject: string, html: string): Promise<SendReportResult> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return { ok: false, error: 'SMTP_USER and SMTP_PASS (Gmail app password) not set' };

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || `"Quantum Alpha Terminal" <${user}>`,
      to,
      subject,
      html,
    });
    return { ok: true, method: 'smtp' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendAnnualReportEmail(
  data: AnnualReportData,
  options?: { dryRun?: boolean },
): Promise<SendReportResult> {
  const html = renderAnnualReportHtml(data);
  const subject = `${data.brand} — ${data.period.label} — AI Intelligence Report`;

  if (options?.dryRun) {
    return { ok: true, preview: true, method: 'dry-run' };
  }

  const to = data.recipientEmail;

  const smtp = await sendViaSmtp(to, subject, html);
  if (smtp.ok) return smtp;

  const resend = await sendViaResend(to, subject, html);
  if (resend.ok) return resend;

  return {
    ok: false,
    error: `Email failed. SMTP: ${smtp.error}. Resend: ${resend.error}. Set GMAIL_APP_PASSWORD + SMTP_USER or RESEND_API_KEY in Render env.`,
    preview: true,
  };
}

export function getReportHtmlForPreview(data: AnnualReportData): string {
  return renderAnnualReportHtml(data);
}
