/**
 * One-off: send demo annual report via Gmail SMTP (reads .env.local).
 * Usage: node scripts/send-demo-report.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const user = process.env.GMAIL_USER || process.env.SMTP_USER;
const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
const to = process.env.ANNUAL_REPORT_EMAIL || 'zn4.editz@gmail.com';

if (!user || !pass) {
  console.error('Missing GMAIL_USER / GMAIL_APP_PASSWORD in .env.local');
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const base = `http://127.0.0.1:${port}`;

let html;
try {
  const res = await fetch(`${base}/api/annual-report?action=preview&kind=demo`);
  if (!res.ok) throw new Error(`Preview HTTP ${res.status}`);
  html = await res.text();
} catch (e) {
  console.error('Start the app first: npm run build && npm run start');
  console.error(e.message);
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user, pass },
});

const info = await transport.sendMail({
  from: `"Quantum Alpha Terminal" <${user}>`,
  to,
  subject: `Quantum Alpha Terminal — 7-day demo — AI Intelligence Report`,
  html,
});

console.log('Sent:', info.messageId, '→', to);
