import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { isLLMConfigured } = await import('@/lib/llmProvider');
  if (!isLLMConfigured()) {
    return NextResponse.json({ error: 'LLM not configured. Set GEMINI_API_KEY, DEEPSEEK_API_KEY, LLM_API_KEY, or OPENAI_API_KEY.' }, { status: 501 });
  }

  let body: { action: string; headline?: string; source?: string; tickers?: string[]; ticker?: string; direction?: string; confidence?: number; rsi?: number; macdHistogram?: number; adx?: number; regime?: string; volatilityRegime?: string; news?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { analyzeNewsWithLLM, generateLLMExplanation } = await import('@/lib/llmIntegration');

  try {
    if (body.action === 'analyze-news' && body.headline) {
      const result = await analyzeNewsWithLLM(body.headline, body.source || '', body.tickers || []);
      if (!result) return NextResponse.json({ error: 'LLM analysis returned no result' }, { status: 502 });
      return NextResponse.json(result);
    }

    if (body.action === 'explain-prediction' && body.ticker) {
      const result = await generateLLMExplanation(
        body.ticker, body.direction || 'NEUTRAL', body.confidence || 50,
        body.rsi || 50, body.macdHistogram || 0, body.adx || 20,
        body.regime || 'UNKNOWN', body.volatilityRegime || 'MODERATE',
        body.news || [],
      );
      if (!result) return NextResponse.json({ error: 'LLM explanation returned no result' }, { status: 502 });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action. Use "analyze-news" or "explain-prediction".' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  const { getLLMProviderInfo } = await import('@/lib/llmProvider');
  const info = getLLMProviderInfo();
  return NextResponse.json({
    configured: info.configured,
    provider: info.provider,
    model: info.model,
    note: info.note,
  });
}
