'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSessionCookie, logActivity, trackGuestSession } from '@/lib/sessionManager';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [guestCode, setGuestCode] = useState('');
  const [showGuest, setShowGuest] = useState(false);
  const router = useRouter();

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErr(data.error || 'Access denied.');
        setLoading(false);
        return;
      }

      const session = {
        email: data.email || email,
        loginTime: Date.now(),
        expiresAt: data.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
        role: 'admin' as const,
      };
      createSessionCookie(session);
      logActivity('login', demoMode ? 'demo-mode' : 'admin');
      router.push('/dashboard');
    } catch {
      setErr('Authentication service unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    const trimmed = guestCode.trim().toUpperCase();
    if (!trimmed) { setErr('Enter your access code.'); return; }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Invalid or expired access code. Contact the admin.');
        return;
      }
      const label = data.label ?? 'guest';
      createSessionCookie({
        email: `guest:${label}`,
        loginTime: Date.now(),
        expiresAt: data.expiresAt ?? Date.now() + 3600000,
        role: 'guest',
        name: label,
      });
      trackGuestSession(label, trimmed);
      logActivity('guest_login', `Guest ${label} via code ${trimmed}`);
      router.push('/dashboard');
    } catch {
      setErr('Could not sign in as guest. Try again or contact the admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) return;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey) {
        const { createBrowserClient } = await import('@supabase/ssr');
        const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
        if (error) { setErr(error.message); return; }
      }
      setResetSent(true);
    } catch {
      setErr('Password reset service unavailable');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCAwaDQwdjQwSDB6IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] opacity-30" />

      <div className="relative z-10 w-full max-w-md px-4 sm:px-6 py-6">
        <div className="terminal-panel border-slate-700/50 p-6 sm:p-8 shadow-2xl shadow-emerald-900/10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="logo-container h-12 w-12 shrink-0" role="img" aria-label="Logo">
              </div>
              <div className="text-center">
                <div className="animate-text-gradient font-bold tracking-widest font-mono text-xl">
                  QUANTUM_ALPHA_V1
                </div>
                <div className="text-[9px] font-mono text-slate-500 mt-1 tracking-widest uppercase">Admin Core Terminal</div>
              </div>
            </div>
            {demoMode && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-[8px] font-mono text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                DEMO MODE
              </div>
            )}
          </div>

          {/* Tabs: Admin / Guest */}
          <div className="flex bg-slate-950 p-0.5 border border-slate-800 rounded-xl mb-6">
            <button onClick={() => { setShowGuest(false); setErr(null); }}
              className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-lg transition-all ${!showGuest ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
              🔐 Admin
            </button>
            <button onClick={() => { setShowGuest(true); setErr(null); }}
              className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-lg transition-all ${showGuest ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
              🎟 Guest Access
            </button>
          </div>

          {!showGuest ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">Email</label>
                  <input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    required />
                </div>
                <div>
                  <label htmlFor="login-password" className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                  <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    required />
                </div>

                {err && (
                  <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-3 text-[10px] font-mono text-red-400 text-center">{err}</div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold font-mono py-3 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/50">
                  {loading ? 'Authenticating...' : 'Access Terminal'}
                </button>
              </form>

              <div className="mt-4 text-center">
                {!showForgot ? (
                  <button onClick={() => setShowForgot(true)} className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-all">
                    Forgot access credentials?
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input id="login-reset-email" name="reset-email" type="email" autoComplete="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-mono text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500/50" />
                    <div className="flex gap-2">
                      <button onClick={handleForgotPassword}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-[9px] font-mono text-white py-2 rounded-lg transition-all">
                        Send Reset
                      </button>
                      <button onClick={() => setShowForgot(false)}
                        className="px-3 bg-slate-800 hover:bg-slate-700 text-[9px] font-mono text-slate-400 py-2 rounded-lg transition-all">
                        Back
                      </button>
                    </div>
                    {resetSent && (
                      <div className="text-[9px] font-mono text-emerald-500">Reset link sent if email exists</div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-[10px] font-mono text-slate-400 mb-1">🔑 Enter your access code</div>
                <div className="text-[7px] font-mono text-slate-600">Provided by the dashboard administrator</div>
              </div>
              <div>
                <label htmlFor="login-guest-code" className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">Access Code</label>
                <input id="login-guest-code" name="guest-code" type="text" autoComplete="one-time-code" value={guestCode} onChange={e => setGuestCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXXXXXXXX"
                  maxLength={20}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-slate-700 text-center tracking-[0.3em] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all uppercase"
                  required />
              </div>

              {err && (
                <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-3 text-[10px] font-mono text-red-400 text-center">{err}</div>
              )}

              <button onClick={handleGuestLogin} disabled={![12, 18].includes(guestCode.trim().length)}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold font-mono py-3 rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50">
                Enter Guest Dashboard
              </button>

              <div className="text-center pt-2">
                <button onClick={() => { setShowGuest(false); setGuestCode(''); setErr(null); }}
                  className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-all">
                  ← Back to admin login
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
            <div className="text-[7px] font-mono text-slate-700 tracking-wider uppercase">
              Authorized Personnel Only • All access monitored
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
