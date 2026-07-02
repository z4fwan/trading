/** Shared admin_auth cookie parsing (proxy, API routes, client sync). */

export interface AuthSession {
  email: string;
  loginTime: number;
  expiresAt: number;
  role?: 'admin' | 'guest';
  name?: string;
}

export function parseAuthCookieValue(raw: string | undefined): AuthSession | null {
  if (!raw) return null;
  const attempts = [raw, decodeURIComponent(raw)];
  for (const value of attempts) {
    try {
      const s = JSON.parse(value) as AuthSession;
      if (s?.email && typeof s.expiresAt === 'number' && s.expiresAt > Date.now()) {
        return s;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function readAuthFromCookieHeader(cookieHeader: string | null): AuthSession | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)admin_auth=([^;]*)/);
  if (!match) return null;
  return parseAuthCookieValue(match[1]);
}
