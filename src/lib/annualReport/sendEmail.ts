import dns from 'node:dns';
import type { AnnualReportData } from './types';
import { renderAnnualReportHtml } from './renderReport';

// Render free tier blocks outbound SMTP (ports 25/465/587) AND has no IPv6 route,
// so Node would resolve smtp.gmail.com to an AAAA record and fail with ENETUNREACH.
// Force IPv4-first resolution so the SMTP fallback works on local/paid hosts.
try {
  (dns as unknown as { setDefaultResultOrder?: (order: string) => void })
    .setDefaultResultOrder?.('ipv4first');
} catch { /* older Node — family:4 on the socket below still applies */ }

export interface SendReportResult {
  ok: boolean;
  method?: string;
  error?: string;
  preview?: boolean;
}

/** Send HTML email via Resend HTTP API (port 443 — works on Render free tier). */
async function sendViaResend(to: string, subject: string, html: string): Promise<SendReportResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const from = process.env.RESEND_FROM || 'Quantum Alpha <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, method: 'resend' };
  } catch (e) {
    return { ok: false, error: `Resend error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Send an HTML email. Render free tier blocks outbound SMTP (ports 25/465/587),
 * so prefer an HTTP email API (Resend, port 443) when RESEND_API_KEY is set, and
 * fall back to SMTP only for local / paid hosts where those ports are open.
 */
export async function sendEmailSmtp(to: string, subject: string, html: string): Promise<SendReportResult> {
  const resendConfigured = !!process.env.RESEND_API_KEY;
  if (resendConfigured) {
    const http = await sendViaResend(to, subject, html);
    if (http.ok) return http;
    console.warn(`[Email] Resend failed (${http.error}); falling back to SMTP.`);
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return {
      ok: false,
      error: 'No email transport: set RESEND_API_KEY (HTTP, works on Render free tier) or SMTP_USER + SMTP_PASS.',
    };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host, port, secure: port === 465,
        auth: { user, pass },
        family: 4,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      await transport.sendMail({
        from: process.env.SMTP_FROM || `"Quantum Alpha Terminal" <${user}>`,
        to, subject, html,
      });
      console.log(`[Email] Sent successfully to ${to} via ${host} (attempt ${attempt})`);
      return { ok: true, method: 'smtp' };
    } catch (e) {
      console.warn(`[Email] SMTP attempt ${attempt} failed:`, e instanceof Error ? e.message : String(e));
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return { ok: false, error: 'SMTP failed after 2 attempts (Render free tier blocks SMTP ports 25/465/587).' };
}

export async function sendAnnualReportEmail(
  data: AnnualReportData,
  options?: { dryRun?: boolean },
): Promise<SendReportResult> {
  const html = renderAnnualReportHtml(data);
  const subject = `${data.brand} — ${data.period.label} — AI Intelligence Report`;
  if (options?.dryRun) return { ok: true, preview: true, method: 'dry-run' };
  return sendEmailSmtp(data.recipientEmail, subject, html);
}

export function getReportHtmlForPreview(data: AnnualReportData): string {
  return renderAnnualReportHtml(data);
}
