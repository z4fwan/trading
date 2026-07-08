import { NextResponse, type NextRequest } from 'next/server';
import { parseAuthCookieValue } from '@/lib/authCookie';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 50;

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // 1. RATE LIMITING
  if (path.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    let rateData = rateLimitMap.get(ip);
    
    if (!rateData || rateData.resetTime < now) {
      rateData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      rateLimitMap.set(ip, rateData);
    } else {
      rateData.count++;
    }

    if (Math.random() < 0.01) {
      for (const [key, val] of rateLimitMap.entries()) {
        if (val.resetTime < now) rateLimitMap.delete(key);
      }
    }

    if (rateData.count > MAX_REQUESTS_PER_MINUTE) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
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

export const config = { matcher: ['/dashboard/:path*', '/chart/:path*', '/login', '/api/:path*'] };
