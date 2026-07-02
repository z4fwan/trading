import { NextResponse } from 'next/server';
import { getDynamicIndianUniverse } from '@/lib/dynamicUniverse';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const universe = getDynamicIndianUniverse();
    return NextResponse.json({ universe, count: universe.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch universe' }, { status: 500 });
  }
}
