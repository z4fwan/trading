import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseAuthCookieValue } from '@/lib/authCookie';

export const runtime = 'nodejs';

export async function GET() {
  const jar = await cookies();
  const session = parseAuthCookieValue(jar.get('admin_auth')?.value);
  if (!session) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }
  return NextResponse.json({
    valid: true,
    email: session.email,
    loginTime: session.loginTime,
    expiresAt: session.expiresAt,
    role: session.role ?? 'admin',
    name: session.name,
  });
}
