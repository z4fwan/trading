import { isMarketClosed } from './marketStatus';
import { getEngineState, markMarketOfflineAnalysis } from './engineState';
import { getServiceClient } from './supabase';
import { callLLM } from './llmProvider';

export async function runMarketClosedAnalysis(): Promise<void> {
  if (!isMarketClosed()) return;

  console.log('[WeekendRetro] Running Market Closed Retrospective & Analysis...');
  const state = getEngineState();
  const svc = getServiceClient();
  
  let recentPerformance = '';
  if (svc) {
    try {
      const { data } = await svc.from('experience_history')
        .select('ticker, result, accuracy_percent, pct_change')
        .order('resolved_at', { ascending: false })
        .limit(20);
        
      if (data && data.length > 0) {
        const correct = data.filter((d: any) => d.result === 'CORRECT').length;
        recentPerformance = `Recent AI accuracy on 20 trades: ${(correct/20)*100}%. Notable trades: ${data.slice(0,3).map((d: any) => `${d.ticker} (${d.pct_change?.toFixed(2)}%)`).join(', ')}`;
      }
    } catch { /* skip */ }
  }

  const prompt = `
  You are an advanced quantitative AI trading system reflecting during market off-hours.
  
  Current State:
  - Overall Historical Accuracy: ${state.selfAwareness.overallAccuracy.toFixed(2)}%
  - Recent Performance: ${recentPerformance || 'N/A'}
  - Active Macro Shock: ${state.macroShockActive ? state.macroShockInfo : 'None'}
  
  Task:
  1. Reflect on the system's performance.
  2. Synthesize global cues (assume generic global market condition based on macro shock state).
  3. Formulate a 3-point "Monday Open Playbook" for the Indian Markets (NSE/BSE).
  
  Keep the response extremely concise, professional, and formatted as a Markdown list.
  `;

  try {
    const { content } = await callLLM('System prompt', prompt, 1024);
    if (content) {
      markMarketOfflineAnalysis(content);
      console.log('[WeekendRetro] Market Closed Retrospective playbook generated successfully.');
    }
  } catch (err) {
    console.log(`[WeekendRetro] Error generating weekend retrospective: ${err}`);
  }
}
