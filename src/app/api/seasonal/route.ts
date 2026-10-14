import { buildSeasonalReport, formatSeasonalReport } from '@/lib/seasonalDemandEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asText = url.searchParams.get('text') === '1';
  try {
    const report = await buildSeasonalReport();
    if (asText) {
      return new Response(formatSeasonalReport(report), {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return Response.json(report);
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
