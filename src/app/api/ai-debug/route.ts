import { NextResponse } from 'next/server';
import { getFullUniverse } from '@/lib/dynamicUniverse';
import { getEngineState } from '@/lib/engineState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const engine = getEngineState();
  return NextResponse.json({
    historyEntries: engine.historyEntries,
    universeSize: getFullUniverse().length,
    newsItems: engine.newsItems.length,
    predictionsStored: engine.predictionsStored,
    llmAnalysisCount: engine.llmAnalysisCount,
    cycleCounters: engine.cycleCounters,
  });
}