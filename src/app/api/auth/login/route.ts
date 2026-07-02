import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SESSION_HOURS = 24;

export async function POST(req: Request) {
  const adminEmail =
    process.env.ADMIN_EMAIL ||
    (process.env.NODE_ENV !== 'production' ? process.env.NEXT_PUBLIC_ADMIN_EMAIL : undefined);
  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    (process.env.NODE_ENV !== 'production' ? process.env.NEXT_PUBLIC_ADMIN_PASSWORD : undefined);

  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment.' },
      { status: 500 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (body.email !== adminEmail || body.password !== adminPassword) {
    return NextResponse.json(
      { error: 'Access denied. Only the master administrator can enter.' },
      { status: 401 },
    );
  }

  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const session = {
    email: adminEmail,
    loginTime: Date.now(),
    expiresAt,
    role: 'admin' as const,
  };

  const res = NextResponse.json(
    { success: true, email: adminEmail, expiresAt, role: 'admin' as const },
    { status: 200 },
  );
  // Must be readable by client JS (sessionManager) and by proxy — HttpOnly caused login/dashboard redirect loops.
  res.cookies.set('admin_auth', encodeURIComponent(JSON.stringify(session)), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
  return res;
}
