import { NextResponse, type NextRequest } from 'next/server';
import { parseAuthCookieValue } from '@/lib/authCookie';

export async function proxy(request: NextRequest) {
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/chart');
  const isLogin = request.nextUrl.pathname === '/login';
  const isApiSync = request.nextUrl.pathname.startsWith('/api/sync');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const validUrl = supabaseUrl && supabaseUrl.startsWith('http') && supabaseUrl !== 'https://supabase.co';

  let authenticated = false;
  let isGuest = false;

  // Always check cookie first (works for admin, guest, and demo mode)
  const s = parseAuthCookieValue(request.cookies.get('admin_auth')?.value);
  if (s) {
    authenticated = true;
    isGuest = s.role === 'guest';
  }

  // Skip Supabase verification for guest sessions
  if (!authenticated && !isDemoMode && validUrl && !isGuest) {
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const supabase = createServerClient(
        supabaseUrl!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        {
          cookies: {
            getAll() { return request.cookies.getAll().map(c => ({ name: c.name, value: c.value })); },
            setAll() {},
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      authenticated = user?.email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL);
    } catch { /* fallback to cookie auth */ }
  }

  if (isApiSync && !authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (isDashboard && !authenticated) return NextResponse.redirect(new URL('/login', request.url));
  if (isLogin && authenticated) return NextResponse.redirect(new URL('/dashboard', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/chart/:path*', '/login', '/api/sync'] };
