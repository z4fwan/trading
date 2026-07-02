/** Server-side admin session check (matches proxy.ts + login cookie). */

export function getIstDateParts(now = new Date()): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = fmt.formatToParts(now);
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

export function isAdminRequestAuthenticated(req: Request): boolean {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const cookie = req.headers.get('cookie');
  if (!cookie || !adminEmail) return false;
  const match = cookie.match(/(?:^|;\s*)admin_auth=([^;]*)/);
  if (!match) return false;
  try {
    const s = JSON.parse(decodeURIComponent(match[1])) as {
      email?: string;
      expiresAt?: number;
      role?: string;
    };
    if (!s.email || !s.expiresAt || Date.now() > s.expiresAt) return false;
    if (s.role === 'guest') return false;
    return s.email === adminEmail || s.role === 'admin';
  } catch {
    return false;
  }
}

export function isReportSecretValid(req: Request): boolean {
  const secret = process.env.ANNUAL_REPORT_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    req.headers.get('x-report-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}

/** Preview + send in production; open in local dev without secret. */
export function canAccessProtectedReport(req: Request): boolean {
  if (isReportSecretValid(req)) return true;
  if (isAdminRequestAuthenticated(req)) return true;
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.ANNUAL_REPORT_SECRET &&
    !process.env.CRON_SECRET
  ) {
    return true;
  }
  return false;
}
