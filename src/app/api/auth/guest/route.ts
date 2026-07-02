import { NextResponse } from 'next/server';
import { validateGuestCode } from '@/lib/sessionManager';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Access code required' }, { status: 400 });
  }

  const guest = validateGuestCode(code);
  if (!guest) {
    return NextResponse.json({ error: 'Invalid or expired access code' }, { status: 401 });
  }

  const session = {
    email: `guest:${guest.label}`,
    loginTime: Date.now(),
    expiresAt: guest.expiresAt,
    role: 'guest' as const,
    name: guest.label,
  };

  const maxAgeSec = Math.max(60, Math.floor((guest.expiresAt - Date.now()) / 1000));
  const res = NextResponse.json({
    success: true,
    label: guest.label,
    expiresAt: guest.expiresAt,
    role: 'guest',
  });
  res.cookies.set('admin_auth', encodeURIComponent(JSON.stringify(session)), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  });
  return res;
}
