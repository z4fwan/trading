import { NextResponse } from 'next/server';
import { runAutoIntradayScan } from '@/lib/autoIntradayScanner';

export async function GET() {
  await runAutoIntradayScan(true);
  return NextResponse.json({ success: true });
}
