import { getSupabase } from './supabase';
import { isSupabaseActive } from './dataSync';

export async function syncGuestCodesToSupabase(codes: { code: string; label: string; createdAt: number; expiresAt: number; used: boolean }[]) {
  if (!isSupabaseActive()) return;
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const rows = codes.map(c => ({ code: c.code, label: c.label, created_at: new Date(c.createdAt).toISOString(), expires_at: new Date(c.expiresAt).toISOString(), used: c.used }));
    const { error } = await (supabase.from('guest_codes') as any).upsert(rows, { onConflict: 'code' });
    if (error) throw error;
  } catch { /* non-fatal */ }
}

export async function syncGuestSessionsToSupabase(sessions: { label: string; code: string; firstSeen: number; lastSeen: number; totalSeconds: number; online: boolean }[]) {
  if (!isSupabaseActive()) return;
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    for (const s of sessions) {
      const row = { code: s.code, label: s.label, first_seen: new Date(s.firstSeen).toISOString(), last_seen: new Date(s.lastSeen).toISOString(), total_seconds: s.totalSeconds, online: s.online };
      const { error } = await (supabase.from('guest_sessions') as any).upsert(row, { onConflict: 'code' });
      if (error) throw error;
    }
  } catch { /* non-fatal */ }
}
