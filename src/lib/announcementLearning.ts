'use client';

export interface AnnouncementPattern {
  category: string;
  count: number;
  avgConfidence: number;
  avgMomentum: number;
  signalDistribution: { buy: number; sell: number; neutral: number };
  commonSectors: string[];
  lastSeen: number;
}

export interface LearningInsight {
  timestamp: number;
  topCategories: { category: string; count: number; winRate: number }[];
  sectorActivity: { sector: string; count: number; avgScore: number }[];
  signalBreakdown: { signal: string; count: number }[];
  totalAnalyzed: number;
}

let lastAnalysis: LearningInsight | null = null;
let analysisInterval: ReturnType<typeof setInterval> | null = null;

export function startAnnouncementLearning(onInsight?: (insight: LearningInsight) => void): () => void {
  if (analysisInterval) clearInterval(analysisInterval);

  async function analyze() {
    try {
      const { getAllAnnouncements } = await import('./announcementDB');
      const items = await getAllAnnouncements(1000);
      if (items.length === 0) return;

      const byCategory: Record<string, AnnouncementPattern> = {};
      const bySector: Record<string, { count: number; totalScore: number }> = {};
      const bySignal: Record<string, number> = {};
      const now = Date.now();

      for (const item of items) {
        const cat = item.ai_analysis?.event_type || item.category || 'GENERAL';
        if (!byCategory[cat]) {
          byCategory[cat] = {
            category: cat,
            count: 0,
            avgConfidence: 0,
            avgMomentum: 0,
            signalDistribution: { buy: 0, sell: 0, neutral: 0 },
            commonSectors: [],
            lastSeen: 0,
          };
        }
        const p = byCategory[cat];
        p.count++;
        p.avgConfidence += item.ai_analysis?.ensemble_confidence || item.ai_analysis?.llm_confidence || 50;
        p.avgMomentum += item.prediction?.momentum_score || 50;
        if (new Date(item.announcement_time || item.received_at).getTime() > p.lastSeen) {
          p.lastSeen = new Date(item.announcement_time || item.received_at).getTime();
        }
        if (item.context?.sector) {
          if (!bySector[item.context.sector]) bySector[item.context.sector] = { count: 0, totalScore: 0 };
          bySector[item.context.sector].count++;
          bySector[item.context.sector].totalScore += item.prediction?.momentum_score || 50;
        }
        const sig = item.ai_analysis?.trading_signal || item.prediction?.direction || 'NEUTRAL';
        if (sig.includes('BUY')) bySignal[sig] = (bySignal[sig] || 0) + 1;
        else if (sig.includes('SELL')) bySignal[sig] = (bySignal[sig] || 0) + 1;
        else bySignal['NEUTRAL'] = (bySignal['NEUTRAL'] || 0) + 1;
      }

      for (const cat of Object.values(byCategory)) {
        cat.avgConfidence = Math.round(cat.avgConfidence / cat.count);
        cat.avgMomentum = Math.round(cat.avgMomentum / cat.count);
      }

      const sectorActivity = Object.entries(bySector)
        .map(([sector, d]) => ({ sector, count: d.count, avgScore: Math.round(d.totalScore / d.count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const signalBreakdown = Object.entries(bySignal)
        .map(([signal, count]) => ({ signal, count }))
        .sort((a, b) => b.count - a.count);

      const topCategories = Object.values(byCategory)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(c => ({
          category: c.category,
          count: c.count,
          winRate: Math.round(c.avgMomentum),
        }));

      const insight: LearningInsight = {
        timestamp: now,
        topCategories,
        sectorActivity,
        signalBreakdown,
        totalAnalyzed: items.length,
      };

      lastAnalysis = insight;
      onInsight?.(insight);
    } catch {
      // silent
    }
  }

  analyze();
  analysisInterval = setInterval(analyze, 5 * 60 * 1000);

  return () => {
    if (analysisInterval) {
      clearInterval(analysisInterval);
      analysisInterval = null;
    }
  };
}

export function getLastLearningInsight(): LearningInsight | null {
  return lastAnalysis;
}

export function stopAnnouncementLearning(): void {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }
}
