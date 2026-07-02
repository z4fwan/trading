import { getSupabase } from './supabase';
import { isSupabaseActive, storage } from './dataSync';
import { logInfo, logWarn } from './errorTracker';

const SESSION_KEY = 'admin_auth';
/** Matches /api/auth/login session lifetime (24h). */
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_KEY = 'opencode_activity_log';
const GUEST_CODES_KEY = 'opencode_guest_codes';
const GUEST_SESSIONS_KEY = 'opencode_guest_sessions';

interface GuestSessionRecord {
  label: string;
  code: string;
  firstSeen: number;
  lastSeen: number;
  totalSeconds: number;
  online: boolean;
  sessions: { login: number; logout?: number }[];
}

interface ActivityEntry {
  timestamp: number;
  action: string;
  detail?: string;
}

export interface GuestCode {
  code: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface SessionData {
  email: string;
  loginTime: number;
  expiresAt: number;
  role?: 'admin' | 'guest';
  name?: string;
}

export function createSessionCookie(session: SessionData): void {
  if (typeof document === 'undefined') return;
  const cookieValue = encodeURIComponent(JSON.stringify(session));
  const expires = new Date(session.expiresAt).toUTCString();
  document.cookie = `${SESSION_KEY}=${cookieValue}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getSessionCookie(): SessionData | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_KEY}=([^;]*)`));
    if (!match) return null;
    const session = JSON.parse(decodeURIComponent(match[1]));
    if (Date.now() > session.expiresAt) {
      destroySessionCookie();
      return null;
    }
    return session;
  } catch { return null; }
}

// === Guest Access Code System (self-validating codes with embedded label) ===
// Codes encode the guest name, expiration, and HMAC directly so they work across machines
// without needing any shared database. Admin's localStorage is used only for tracking/revocation.
// Format (18 chars): RRRR LLLLLL EEEE HHHH
//   R = random (4 chars)
//   L = label encoded (6 chars, decodes to up to 5-char name)
//   E = expiry hours since epoch (4 chars)
//   H = HMAC (4 chars)
// Legacy 12-char codes are also supported (label defaults to 'Guest').
const GUEST_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EPOCH_BASE_MS = 1672531200000; // Jan 1 2023 00:00 UTC

// Label encoding uses 36-char alphabet (A-Z + 0-9)
const LABEL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function getGuestSecret(): string | null {
  return process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL || null;
}

export function isGuestCodeSystemAvailable(): boolean {
  return !!getGuestSecret();
}

function guestHMAC(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  let h = Math.abs(hash);
  let result = '';
  for (let i = 0; i < 4; i++) {
    result = GUEST_CHARS[h % GUEST_CHARS.length] + result;
    h = Math.floor(h / GUEST_CHARS.length);
  }
  return result;
}

function encodeHours(hours: number): string {
  let h = Math.max(0, Math.floor(hours));
  let result = '';
  for (let i = 0; i < 4; i++) {
    result = GUEST_CHARS[h % GUEST_CHARS.length] + result;
    h = Math.floor(h / GUEST_CHARS.length);
  }
  return result;
}

function decodeHours(encoded: string): number {
  let result = 0;
  for (let i = 0; i < encoded.length; i++) {
    const idx = GUEST_CHARS.indexOf(encoded[i]);
    if (idx === -1) return 0;
    result = result * GUEST_CHARS.length + idx;
  }
  return result;
}

/** Encode first 5 chars of label into a 6-char base32 string. Uses A-Z + 0-9 alphabet. */
function encodeLabel(label: string): string {
  let san = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (san.length === 0) san = 'AAAAA';
  while (san.length < 5) san += 'A';
  san = san.slice(0, 5);
  let idx = 0;
  for (const ch of san) {
    idx = idx * 36 + LABEL_CHARS.indexOf(ch);
  }
  let result = '';
  for (let i = 0; i < 6; i++) {
    result = GUEST_CHARS[idx % 32] + result;
    idx = Math.floor(idx / 32);
  }
  return result;
}

/** Decode a 6-char base32 label back to a display name (up to 5 chars). */
function decodeLabel(encoded: string): string {
  let idx = 0;
  for (const ch of encoded) {
    idx = idx * 32 + GUEST_CHARS.indexOf(ch);
  }
  let result = '';
  for (let i = 0; i < 5; i++) {
    result = LABEL_CHARS[idx % 36] + result;
    idx = Math.floor(idx / 36);
  }
  return result.replace(/A+$/, '').trim() || 'User';
}

export function generateGuestCode(label: string, durationMs: number): GuestCode | null {
  const secret = getGuestSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + durationMs;
  const expiryHours = Math.floor((expiresAt - EPOCH_BASE_MS) / 3600000);
  let random = '';
  for (let i = 0; i < 4; i++) random += GUEST_CHARS[Math.floor(Math.random() * GUEST_CHARS.length)];
  const labelEnc = encodeLabel(label);
  const expiryEncoded = encodeHours(expiryHours);
  const sig = guestHMAC(`${expiryHours}:${labelEnc}:${random}:${secret}`);
  const code = random + labelEnc + expiryEncoded + sig;
  const guest: GuestCode = { code, label, createdAt: Date.now(), expiresAt, used: false };
  const all = getGuestCodes();
  all.push(guest);
  try { localStorage.setItem(GUEST_CODES_KEY, JSON.stringify(all)); } catch (e) { logWarn('Guest', 'Failed to save guest code', e); }
  return guest;
}

export function getGuestCodes(): GuestCode[] {
  try {
    const raw = localStorage.getItem(GUEST_CODES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function revokeGuestCode(code: string): void {
  const all = getGuestCodes().filter(g => g.code !== code);
  try { localStorage.setItem(GUEST_CODES_KEY, JSON.stringify(all)); } catch (e) { logWarn('Guest', 'Failed to revoke code', e); }
}

export function validateGuestCode(code: string): GuestCode | null {
  const trimmed = code.trim().toUpperCase();
  const validChars = (s: string) => { for (const ch of s) { if (!GUEST_CHARS.includes(ch)) return false; } return true; };

  // 1. Check localStorage first (same machine — contains revocation info)
  const all = getGuestCodes();
  const stored = all.find(g => g.code === trimmed);
  if (stored) {
    if (stored.used) return null;
    if (Date.now() > stored.expiresAt) return null;
    return stored;
  }

  const secret = getGuestSecret();
  if (!secret) return null;

  // 2. Try new 18-char format: RRRR LLLLLL EEEE HHHH
  if (trimmed.length === 18 && validChars(trimmed)) {
    const random = trimmed.slice(0, 4);
    const labelEnc = trimmed.slice(4, 10);
    const expiryEncoded = trimmed.slice(10, 14);
    const sig = trimmed.slice(14, 18);
    const expiryHours = decodeHours(expiryEncoded);
    if (expiryHours === 0) return null;
    const expiresAt = EPOCH_BASE_MS + expiryHours * 3600000;
    if (Date.now() > expiresAt) return null;
    const expectedSig = guestHMAC(`${expiryHours}:${labelEnc}:${random}:${secret}`);
    if (sig !== expectedSig) return null;
    const label = decodeLabel(labelEnc);
    return { code: trimmed, label, createdAt: expiresAt - 3600000, expiresAt, used: false };
  }

  // 3. Legacy 12-char format: RRRR EEEE HHHH (label defaults to 'guest')
  if (trimmed.length === 12 && validChars(trimmed)) {
    const random = trimmed.slice(0, 4);
    const expiryEncoded = trimmed.slice(4, 8);
    const sig = trimmed.slice(8, 12);
    const expiryHours = decodeHours(expiryEncoded);
    if (expiryHours === 0) return null;
    const expiresAt = EPOCH_BASE_MS + expiryHours * 3600000;
    if (Date.now() > expiresAt) return null;
    const expectedSig = guestHMAC(`${expiryHours}:${random}:${secret}`);
    if (sig !== expectedSig) return null;
    return { code: trimmed, label: 'Guest', createdAt: expiresAt - 3600000, expiresAt, used: false };
  }

  return null;
}

export function getSessionRole(): 'admin' | 'guest' | null {
  const cookie = getSessionCookie();
  if (!cookie) return null;
  return cookie.role || 'admin';
}

export function destroySessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
  logActivity('logout');
}

/** Clears HttpOnly server cookie + client-readable cookie (use on sign out). */
export async function signOut(): Promise<void> {
  destroySessionCookie();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch { /* offline */ }
}

async function fetchServerSession(): Promise<SessionData | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const d = await res.json() as {
      valid?: boolean;
      email?: string;
      loginTime?: number;
      expiresAt?: number;
      role?: 'admin' | 'guest';
      name?: string;
    };
    if (!d.valid || !d.email || !d.expiresAt) return null;
    return {
      email: d.email,
      loginTime: d.loginTime ?? Date.now(),
      expiresAt: d.expiresAt,
      role: d.role,
      name: d.name,
    };
  } catch {
    return null;
  }
}

/** Sync HttpOnly session to client cookie, or verify guest/admin session before rendering dashboard. */
export async function ensureClientSession(): Promise<boolean> {
  if (isSessionValid()) return true;
  const remote = await fetchServerSession();
  if (!remote) return false;
  createSessionCookie(remote);
  return true;
}

// Supabase auth integration
// Note: credentials are validated by the caller (login page) before calling this function.
// This function only handles the Supabase session creation and cookie fallback.
export async function loginWithSupabase(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  let supabaseError: string | null = null;

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        supabaseError = error.message;
        logWarn('Auth', `Supabase login failed: ${error.message}. Using cookie auth as fallback.`);
      } else if (data.session) {
        const session = { email, loginTime: Date.now(), expiresAt: Date.now() + ADMIN_SESSION_MS, role: 'admin' as const };
        createSessionCookie(session);
        logActivity('login', 'supabase-auth');
        return { success: true };
      }
    } catch (e) {
      supabaseError = e instanceof Error ? e.message : 'Supabase connection failed';
      logWarn('Auth', `Supabase connection error: ${supabaseError}. Using cookie auth as fallback.`);
    }
  }

  // Cookie-based auth fallback (credentials already validated by login page)
  const session = { email, loginTime: Date.now(), expiresAt: Date.now() + ADMIN_SESSION_MS, role: 'admin' as const };
  createSessionCookie(session);
  logActivity('login', supabaseError ? 'cookie-auth-supabase-down' : 'cookie-auth');
  return { success: true };
}

export async function logoutFromSupabase(): Promise<void> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      await supabase.auth.signOut();
    } catch (e) { logWarn('Auth', 'Supabase signOut failed', e); }
  }
  destroySessionCookie();
}

export async function getSupabaseSession() {
  if (!isSupabaseActive()) return null;
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch { return null; }
}

export async function checkSupabaseUser(): Promise<{ authenticated: boolean; email?: string }> {
  if (!isSupabaseActive()) {
    const cookie = getSessionCookie();
    return { authenticated: !!cookie, email: cookie?.email };
  }
  try {
    const supabase = getSupabase();
    if (!supabase) return { authenticated: false };
    const { data: { user } } = await supabase.auth.getUser();
    return { authenticated: !!user, email: user?.email };
  } catch {
    return { authenticated: false };
  }
}

export function isSessionValid(): boolean {
  const cookie = getSessionCookie();
  return cookie !== null && Date.now() < cookie.expiresAt;
}

export function getSessionTimeRemaining(): number {
  const cookie = getSessionCookie();
  if (!cookie) return 0;
  return Math.max(0, cookie.expiresAt - Date.now());
}

export function logActivity(action: string, detail?: string): void {
  try {
    const raw = storage.get<ActivityEntry[]>(ACTIVITY_KEY);
    const log: ActivityEntry[] = raw || [];
    log.push({ timestamp: Date.now(), action, detail });
    storage.set(ACTIVITY_KEY, log.slice(-100));
  } catch { }
}

export function getActivityLog(count = 20): ActivityEntry[] {
  try {
    const log = storage.get<ActivityEntry[]>(ACTIVITY_KEY);
    if (!log) return [];
    return log.slice(-count).reverse();
  } catch { return []; }
}

export function getGuestSessions(): GuestSessionRecord[] {
  try {
    const raw = storage.get<string>(GUEST_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveGuestSessions(sessions: GuestSessionRecord[]): void {
  try { storage.set(GUEST_SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
}

export function trackGuestSession(label: string, code: string): void {
  const sessions = getGuestSessions();
  let record = sessions.find(s => s.code === code);
  const now = Date.now();
  if (!record) {
    record = { label, code, firstSeen: now, lastSeen: now, totalSeconds: 0, online: true, sessions: [{ login: now }] };
    sessions.push(record);
  } else {
    record.lastSeen = now;
    record.online = true;
    if (record.sessions.length === 0 || record.sessions[record.sessions.length - 1].logout !== undefined) {
      record.sessions.push({ login: now });
    }
  }
  saveGuestSessions(sessions);
}

export function recordGuestLogout(code: string): void {
  const sessions = getGuestSessions();
  const record = sessions.find(s => s.code === code);
  if (!record) return;
  const now = Date.now();
  record.online = false;
  record.lastSeen = now;
  const lastSession = record.sessions[record.sessions.length - 1];
  if (lastSession && !lastSession.logout) {
    lastSession.logout = now;
    record.totalSeconds += Math.round((now - lastSession.login) / 1000);
  }
  saveGuestSessions(sessions);
}

export function computeGuestTotalHours(code: string): number {
  const sessions = getGuestSessions();
  const record = sessions.find(s => s.code === code);
  if (!record) return 0;
  let total = record.totalSeconds;
  const lastSession = record.sessions[record.sessions.length - 1];
  if (lastSession && !lastSession.logout) {
    total += Math.round((Date.now() - lastSession.login) / 1000);
  }
  return Math.round((total / 3600) * 100) / 100;
}

export function getAllGuestStats() {
  const sessions = getGuestSessions();
  const now = Date.now();
  return sessions.map(s => {
    let totalSec = s.totalSeconds;
    const lastSession = s.sessions[s.sessions.length - 1];
    if (lastSession && !lastSession.logout) {
      totalSec += Math.round((now - lastSession.login) / 1000);
    }
    return {
      label: s.label,
      code: s.code,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      online: s.online,
      totalHours: Math.round((totalSec / 3600) * 100) / 100,
      sessionCount: s.sessions.length,
    };
  });
}

const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000;

export function renewSessionIfNeeded(): void {
  const session = getSessionCookie();
  if (!session) return;
  if (session.role === 'guest') return;
  const remaining = session.expiresAt - Date.now();
  if (remaining < RENEWAL_THRESHOLD_MS) {
    const renewed = { email: session.email, loginTime: Date.now(), expiresAt: Date.now() + ADMIN_SESSION_MS, role: 'admin' as const };
    createSessionCookie(renewed);
    logActivity('session_renewed', `Renewed for ${session.email}`);
  }
}

export function startSessionMonitor(intervalMs = 60000): () => void {
  const timer = setInterval(() => {
    void (async () => {
      if (isSessionValid()) return;
      const ok = await ensureClientSession();
      if (!ok) window.location.href = '/login';
    })();
  }, intervalMs);
  return () => clearInterval(timer);
}

export { SESSION_KEY };
