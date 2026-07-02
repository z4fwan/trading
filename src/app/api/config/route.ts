import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  // @ts-ignore
  const { data, error } = await svc.from('system_config').select('key_name, updated_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data });
}

export async function POST(req: Request) {
  try {
    const { key_name, key_value } = await req.json();
    if (!key_name || !key_value) {
      return NextResponse.json({ error: 'Missing key_name or key_value' }, { status: 400 });
    }

    const svc = getServiceClient();
    if (!svc) {
      return NextResponse.json({ error: 'Database service client not configured' }, { status: 500 });
    }

    const { error } = await svc.from('system_config').upsert({
      key_name,
      key_value,
      updated_at: Date.now(),
    } as any);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
