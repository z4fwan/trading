'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { INDEX_TICKERS_ARRAY, INDEX_TICKERS } from '@/lib/marketConfig';
import type { EngineMacroShock } from '@/lib/engineState';

interface IntelResponse {
  timestamp: number;
  engine: { running: boolean; quotesPerMin: number; newsPerHour: number; mlCycles: number; aiLearningCycles: number; modelsTrained: number; predictionsStored: number; newsItems: number; llmNewsItems: number };
  llm: { configured: boolean; cache: { entries: number; hitRate: number }; lastAnalysisAge: string };
  macro: { active: boolean; detail: EngineMacroShock | null; info: string | null };
  eliteFeeds: { mode: string; paidTwitterApi: boolean; feedCount: number; handlesCovered: number; handlesMissing: string[]; engineEliteNews: number };
  autonomous24x7: { active: boolean; lastLearning: string; lastLearningResult: string | null; serverWeightSamples: number; lastStockPulse: string; stockPulseResult: string | null; stockPulseGemsCached: number };
  stockPulse24x7: { status: string; gemsCached: number; studiedTickers: number; marketBrief: string };
  selfAwareness: { overallAccuracy: number; selfAwarenessScore: number; metaConfidence: number; trend: string; strengths: number; weaknesses: number };
  strategy: { variants: number; bestName: string; bestScore: number };
}

interface WeightData { weights: Record<string, number> | null; default_weight: number; total_samples: number; recorded_at: string }

interface SignalItem { symbol: string; direction: 'BULLISH' | 'BEARISH'; confidence: number; timestamp: number; price: number }
interface SignalsResponse { signals: SignalItem[]; stats: { bullish: number; bearish: number; total: number } }
interface CueData { usClose: string; asianMarkets: string; giftNifty: string; vix: number; timestamp: number }
interface AccuracyData { rollingAccuracy: number; totalPredictions: number; resolvedCount: number }

const PULSE_INTERVAL = 30000;

function n(s: number | undefined | null, d = 2): string { return s != null ? s.toFixed(d) : '—'; }

function MiniCard({ label, value, color = 'text-slate-300' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg px-2.5 py-2">
      <div className="text-[7px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[11px] font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, color = 'text-emerald-400', extra }: { title: string; color?: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className={`text-[9px] font-bold ${color} uppercase tracking-wider`}>{title}</div>
      {extra}
    </div>
  );
}

function SparkBar({ pct, color = 'bg-emerald-500' }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function BrainHub() {
  const { indices, connectionStatus, pricesStreaming } = useMarketData();
  const [intel, setIntel] = useState<IntelResponse | null>(null);
  const [signalsData, setSignalsData] = useState<SignalsResponse | null>(null);
  const [cues, setCues] = useState<CueData | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyData | null>(null);
  const [weights, setWeights] = useState<WeightData | null>(null);
  const [newsHighImpact, setNewsHighImpact] = useState<{ title: string; sentiment: string; impact: string }[]>([]);
  const [thoughtLog, setThoughtLog] = useState<string[]>([]);
  const [pulseLoading, setPulseLoading] = useState(true);
  const cancelRef = useRef(false);

  const addThought = (msg: string) => setThoughtLog(prev => [msg, ...prev].slice(0, 16));

  useEffect(() => {
    cancelRef.current = false;
    const load = async () => {
      if (cancelRef.current) return;
      addThought('🧠 Synaptic scan initiated...');
      try {
        const [intelRes, sigRes, cueRes, accRes, newsRes, wtRes] = await Promise.allSettled([
          fetch('/api/intelligence'), fetch('/api/ai-signals'), fetch('/api/global-cues'),
          fetch('/api/accuracy'), fetch('/api/news?limit=3'), fetch('/api/knowledge/weights'),
        ]);

        if (intelRes.status === 'fulfilled') {
          const d: IntelResponse = await intelRes.value.json();
          setIntel({ ...d, macro: { ...d.macro, detail: null } });
          if (d.selfAwareness) addThought(`🧠 Self-awareness: ${d.selfAwareness.selfAwarenessScore}% · ${d.selfAwareness.trend}`);
          if (d.engine?.running) addThought(`⚡ Cortex active · ${d.engine.quotesPerMin}qpm · ${d.engine.newsPerHour}nph`);
          if (d.autonomous24x7?.lastLearningResult) addThought(`📚 Last learn: ${d.autonomous24x7.lastLearningResult}`);
          if (d.macro?.active) addThought(`⚠️ Macro shock: ${d.macro.detail?.headline || d.macro.info}`);
          if (d.autonomous24x7?.stockPulseGemsCached > 0) addThought(`💎 ${d.autonomous24x7.stockPulseGemsCached} gems cached`);
        }
        if (sigRes.status === 'fulfilled') {
          const d: SignalsResponse = await sigRes.value.json();
          setSignalsData(d);
          if (d.stats?.total > 0) addThought(`📡 ${d.stats.total} signals (▲${d.stats.bullish} ▼${d.stats.bearish})`);
        }
        if (cueRes.status === 'fulfilled') {
          const d: CueData = await cueRes.value.json();
          setCues(d);
          if (d.giftNifty) addThought(`🌍 Gift Nifty: ${d.giftNifty}`);
        }
        if (accRes.status === 'fulfilled') {
          const d: AccuracyData = await accRes.value.json();
          setAccuracy(d);
          if (d.rollingAccuracy) addThought(`📊 Accuracy: ${(d.rollingAccuracy * 100).toFixed(1)}%`);
        }
        if (newsRes.status === 'fulfilled') {
          const d = await newsRes.value.json();
          const items = Array.isArray(d) ? d : d.news || d.items || [];
          const high = items.filter((i: any) => (i.impactScore || 0) >= 65 || i.probability >= 65)
            .map((i: any) => ({ title: i.title || i.headline, sentiment: i.sentiment || 'neutral', impact: `+${i.impactScore || i.probability || 0}%` }))
            .slice(0, 5);
          setNewsHighImpact(high);
          if (high.length > 0) addThought(`📰 ${high.length} high-impact items`);
        }
        if (wtRes.status === 'fulfilled') {
          const d: WeightData = await wtRes.value.json();
          setWeights(d);
          if (d?.weights) addThought(`⚖️ Weights loaded · ${d.total_samples} samples`);
        }
        setPulseLoading(false);
        addThought('✅ Neural mesh fully connected');
      } catch {
        addThought('⚠️ Synaptic disruption — reconnecting...');
        setPulseLoading(false);
      }
    };
    load();
    const id = setInterval(load, PULSE_INTERVAL);
    return () => { cancelRef.current = true; clearInterval(id); };
  }, []);

  const nifty = indices['^NSEI'];
  const sensex = indices['^BSESN'];

  const signalBar = useMemo(() => {
    if (!signalsData?.stats) return null;
    const { bullish, bearish, total } = signalsData.stats;
    if (total === 0) return null;
    return { bullishPct: (bullish / total) * 100, bearishPct: (bearish / total) * 100, total };
  }, [signalsData]);

  const weightEntries = useMemo(() => {
    if (!weights?.weights) return [];
    return Object.entries(weights.weights)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
  }, [weights]);

  return (
    <div className="w-full min-w-0 space-y-3 font-mono">
      {/* BRAIN HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/60 rounded-2xl px-4 sm:px-6 py-4 sm:py-5">
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]" viewBox="0 0 400 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" /><stop offset="50%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <path d="M0,100 Q50,20 100,50 T200,30 T300,80 T400,60" stroke="url(#bg)" strokeWidth="0.5" fill="none" />
          <path d="M0,120 Q60,80 120,100 T240,60 T360,110 T400,90" stroke="url(#bg)" strokeWidth="0.3" fill="none" />
          <path d="M0,80 Q40,130 100,110 T200,140 T320,80 T400,130" stroke="url(#bg)" strokeWidth="0.4" fill="none" />
        </svg>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 via-blue-500/20 to-purple-500/20 border border-emerald-500/30 flex items-center justify-center">
                <span className="text-lg">🧠</span>
              </div>
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${pulseLoading ? 'bg-slate-600 animate-pulse' : intel?.engine?.running ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'} border border-slate-950`} />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">Cortex Intelligence</div>
              <div className="text-[8px] text-slate-600 flex items-center gap-2">
                <span>v2.0</span>
                <span>·</span>
                <span className={connectionStatus === 'disconnected' ? 'text-red-400' : pricesStreaming ? 'text-emerald-400' : 'text-amber-400'}>
                  {connectionStatus === 'disconnected' ? 'OFFLINE' : pricesStreaming ? 'LIVE' : 'CLOSED'}
                </span>
                {intel?.selfAwareness && (
                  <><span>·</span>
                    <span className={intel.selfAwareness.trend === 'IMPROVING' ? 'text-emerald-400' : intel.selfAwareness.trend === 'DECLINING' ? 'text-red-400' : 'text-yellow-400'}>
                      {intel.selfAwareness.trend}
                    </span></>
                )}
                {intel?.autonomous24x7 && (
                  <><span>·</span>
                    <span className="text-slate-500">{intel.autonomous24x7.lastLearning}</span></>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[9px]">
            {intel?.selfAwareness && (
              <>
                <MiniCard label="IQ" value={intel.selfAwareness.selfAwarenessScore != null ? `${intel.selfAwareness.selfAwarenessScore.toFixed(0)}%` : '—'} color={intel.selfAwareness.selfAwarenessScore > 65 ? 'text-emerald-400' : 'text-amber-400'} />
                <MiniCard label="Accuracy" value={intel.selfAwareness.overallAccuracy != null ? `${(intel.selfAwareness.overallAccuracy * 100).toFixed(1)}%` : '—'} color={intel.selfAwareness.overallAccuracy > 0.6 ? 'text-emerald-400' : 'text-red-400'} />
                <MiniCard label="Confidence" value={intel.selfAwareness.metaConfidence != null ? `${intel.selfAwareness.metaConfidence.toFixed(0)}%` : '—'} />
              </>
            )}
            {accuracy?.rollingAccuracy != null && <MiniCard label="Rolling" value={`${(accuracy.rollingAccuracy * 100).toFixed(1)}%`} color={accuracy.rollingAccuracy > 0.55 ? 'text-emerald-400' : 'text-amber-400'} />}
            {intel?.engine && <MiniCard label="QPM" value={String(intel.engine.quotesPerMin)} color="text-blue-400" />}
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* COL 1: Market Pulse + Global Cues + Subconscious */}
        <div className="space-y-3">
          {/* Market Pulse */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="Market Pulse" color="text-emerald-400"
              extra={<span className={`text-[7px] px-1.5 py-0.5 rounded-full font-mono ${pricesStreaming ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                {pricesStreaming ? '● LIVE' : '○ CLOSED'}
              </span>}
            />
            <div className="space-y-1.5">
              {INDEX_TICKERS_ARRAY.map(sym => {
                const q = indices[sym];
                return (
                  <div key={sym} className="flex items-center justify-between text-[10px] font-mono py-1 px-2 rounded-lg hover:bg-slate-800/30 transition-colors">
                    <span className="text-slate-400 truncate mr-2">{INDEX_TICKERS[sym] || sym}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-white font-bold">{q?.price?.toFixed(2) || '—'}</span>
                      {q?.changePercent != null && <span className={`font-bold text-[9px] ${q.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Global Cues */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="Global Cues" color="text-blue-400"
              extra={cues ? <span className="text-[7px] text-slate-600">{new Date(cues.timestamp).toLocaleTimeString()}</span> : undefined}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <MiniCard label="US Close" value={cues?.usClose || '—'} color="text-blue-400" />
              <MiniCard label="Asian" value={cues?.asianMarkets || '—'} color="text-cyan-400" />
              <MiniCard label="Gift Nifty" value={cues?.giftNifty || '—'} color="text-emerald-400" />
              <MiniCard label="VIX" value={cues?.vix != null ? cues.vix.toFixed(2) : '—'} color={cues?.vix != null && cues.vix > 15 ? 'text-red-400' : 'text-emerald-400'} />
            </div>
          </div>

          {/* Subconscious Engine */}
          {intel?.engine && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Subconscious" color="text-purple-400" />
              <div className="grid grid-cols-2 gap-1 mb-2">
                <MiniCard label="Engine" value={intel.engine.running ? 'ACTIVE' : 'DOWN'} color={intel.engine.running ? 'text-emerald-400' : 'text-red-400'} />
                <MiniCard label="QPM" value={String(intel.engine.quotesPerMin)} color="text-blue-400" />
                <MiniCard label="News/hr" value={String(intel.engine.newsPerHour)} color="text-cyan-400" />
                <MiniCard label="ML Cycles" value={String(intel.engine.mlCycles)} color="text-yellow-400" />
                <MiniCard label="AI Cycles" value={String(intel.engine.aiLearningCycles)} color="text-purple-400" />
                <MiniCard label="Models" value={String(intel.engine.modelsTrained)} color="text-sky-400" />
              </div>
              {intel.engine.newsItems > 0 && (
                <div className="flex justify-between text-[8px] text-slate-600 mt-1 pt-2 border-t border-slate-800/40">
                  <span>News items: {intel.engine.newsItems}</span>
                  <span className="text-emerald-400/60">LLM analyzed: {intel.engine.llmNewsItems}</span>
                </div>
              )}
            </div>
          )}

          {/* Elite Feeds */}
          {intel?.eliteFeeds && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Feeds Coverage" color="text-sky-400" />
              <div className="flex items-center justify-between text-[8px] font-mono mb-1.5">
                <span className="text-slate-600">{intel.eliteFeeds.mode}</span>
                <span className={`text-[7px] px-1.5 py-0.5 rounded-full ${intel.eliteFeeds.handlesCovered > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-600'}`}>
                  {intel.eliteFeeds.handlesCovered}/{intel.eliteFeeds.feedCount}
                </span>
              </div>
              <SparkBar pct={(intel.eliteFeeds.handlesCovered / Math.max(1, intel.eliteFeeds.feedCount)) * 100} color="bg-sky-500" />
              {intel.eliteFeeds.handlesMissing?.length > 0 && (
                <div className="text-[7px] text-slate-600 mt-1.5 truncate" title={intel.eliteFeeds.handlesMissing.join(', ')}>
                  Missing: {intel.eliteFeeds.handlesMissing.slice(0, 3).join(', ')}{intel.eliteFeeds.handlesMissing.length > 3 ? '...' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* COL 2: Signals + News + Stock Pulse */}
        <div className="space-y-3">
          {/* Active Signals */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="Active Signals" color="text-yellow-400"
              extra={signalsData?.stats ? <span className="text-[8px] text-slate-600">{signalsData.stats.total} active</span> : undefined}
            />
            {signalBar && (
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 rounded-l-full transition-all" style={{ width: `${signalBar.bullishPct}%` }} />
                  <div className="h-full bg-red-500 rounded-r-full transition-all" style={{ width: `${signalBar.bearishPct}%` }} />
                </div>
                <span className="text-[8px] text-slate-600 font-mono shrink-0">
                  <span className="text-emerald-400">▲{signalsData!.stats.bullish}</span>
                  <span className="mx-1">/</span>
                  <span className="text-red-400">▼{signalsData!.stats.bearish}</span>
                </span>
              </div>
            )}
            {(!signalsData?.signals || signalsData.signals.length === 0) ? (
              <div className="text-[9px] text-slate-600 text-center py-4">No active signals</div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                {signalsData.signals.slice(0, 8).map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[8px] ${s.direction === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>{s.direction === 'BULLISH' ? '▲' : '▼'}</span>
                      <span className="text-[10px] font-bold text-white truncate">{s.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9px] font-bold ${s.confidence >= 70 ? 'text-emerald-400' : s.confidence >= 50 ? 'text-yellow-400' : 'text-slate-500'}`}>{s.confidence}%</span>
                      <span className="text-[8px] text-slate-600">{s.price?.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* News Intelligence */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="News Intelligence" color="text-cyan-400" />
            {newsHighImpact.length === 0 ? (
              <div className="text-[9px] text-slate-600 text-center py-4">No high-impact news</div>
            ) : (
              <div className="space-y-1.5">
                {newsHighImpact.map((n, i) => (
                  <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-slate-800/20">
                    <span className={`text-[8px] mt-0.5 shrink-0 ${n.sentiment === 'positive' ? 'text-emerald-400' : n.sentiment === 'negative' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {n.sentiment === 'positive' ? '▲' : n.sentiment === 'negative' ? '▼' : '◆'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-300 truncate">{n.title}</div>
                      <div className="text-[7px] text-emerald-400/70">{n.impact}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {intel?.engine && intel.engine.llmNewsItems > 0 && (
              <div className="text-[7px] text-slate-600 mt-2 pt-2 border-t border-slate-800/40">
                {intel.engine.llmNewsItems} LLM-analyzed · Last: {intel.llm?.lastAnalysisAge}
              </div>
            )}
          </div>

          {/* Stock Pulse Gems */}
          {intel?.autonomous24x7 && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Stock Pulse" color="text-emerald-400" />
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <MiniCard label="Gems Cached" value={String(intel.autonomous24x7.stockPulseGemsCached)} color="text-emerald-400" />
                <MiniCard label="Last Scan" value={intel.autonomous24x7.lastStockPulse} />
              </div>
              {intel.autonomous24x7.stockPulseResult && (
                <div className="bg-slate-800/20 rounded-lg p-2 mb-1">
                  <div className="text-[8px] text-emerald-400/80 break-words">{intel.autonomous24x7.stockPulseResult}</div>
                </div>
              )}
              {intel.stockPulse24x7?.marketBrief && (
                <div className="text-[7px] text-slate-600 mt-1.5 pt-2 border-t border-slate-800/40 truncate" title={intel.stockPulse24x7.marketBrief}>
                  {intel.stockPulse24x7.marketBrief}
                </div>
              )}
            </div>
          )}
        </div>

        {/* COL 3: Self-Learning + Weights + Activity */}
        <div className="space-y-3">
          {/* Self-Learning Dashboard */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="Self-Learning" color="text-purple-400"
              extra={intel?.llm ? <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-mono ${intel.llm.configured ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-600'}`}>LLM {intel.llm.configured ? 'ON' : 'OFF'}</span> : undefined}
            />
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <MiniCard label="Last Learn" value={intel?.autonomous24x7?.lastLearning || '—'} />
                <MiniCard label="Weight Samples" value={String(intel?.autonomous24x7?.serverWeightSamples || 0)} color="text-amber-400" />
              </div>
              {intel?.autonomous24x7?.lastLearningResult && (
                <div className="bg-slate-800/20 rounded-lg p-2">
                  <div className="text-[8px] text-purple-300/80 break-words">{intel.autonomous24x7.lastLearningResult}</div>
                </div>
              )}
              {intel?.strategy && (
                <div className="bg-slate-800/30 rounded-lg p-2 mt-1">
                  <div className="flex justify-between mb-1 text-[8px]">
                    <span className="text-slate-600">Strategy Variants</span>
                    <span className="text-slate-300">{intel.strategy.variants}</span>
                  </div>
                  {intel.strategy.bestName && (
                    <div className="flex justify-between text-[8px]">
                      <span className="text-slate-600">Best</span>
                      <span className="text-emerald-400">{intel.strategy.bestName}{intel.strategy.bestScore != null ? ` (${intel.strategy.bestScore.toFixed(1)})` : ''}</span>
                    </div>
                  )}
                </div>
              )}
              {intel?.macro?.active && (() => {
                const shockInfo = String(intel.macro.info ?? '');
                const shockSrc = String(intel.macro.detail?.source ?? '');
                return (
                  <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                    <div className="text-red-400 text-[9px] font-bold mb-0.5">⚠ Macro Shock</div>
                    <div className="text-red-300/70 text-[7px]">{shockInfo || '—'}</div>
                    {shockSrc && <div className="text-red-300/50 text-[7px] mt-0.5">Source: {shockSrc}</div>}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Indicator Weights */}
          {weightEntries.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Indicator Weights" color="text-amber-400"
                extra={<span className="text-[7px] text-slate-600">{weights?.total_samples || 0} samples</span>}
              />
              <div className="space-y-1 max-h-[180px] overflow-y-auto custom-scrollbar">
                {weightEntries.map(([key, val]) => {
                  const pct = ((val / (weights?.default_weight || 1)) - 1) * 100;
                  return (
                    <div key={key} className="flex items-center gap-2 text-[8px]">
                      <span className="text-slate-400 w-16 truncate shrink-0">{key}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, Math.abs(pct) + 50)}%` }} />
                      </div>
                      <span className={`w-10 text-right font-bold ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accuracy Analytics */}
          {accuracy && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Accuracy Analytics" color="text-sky-400" />
              <div className="grid grid-cols-3 gap-1.5">
                <MiniCard label="Rolling" value={`${(accuracy.rollingAccuracy * 100).toFixed(1)}%`} color={accuracy.rollingAccuracy > 0.55 ? 'text-emerald-400' : 'text-amber-400'} />
                <MiniCard label="Resolved" value={String(accuracy.resolvedCount)} />
                <MiniCard label="Total" value={String(accuracy.totalPredictions)} />
              </div>
            </div>
          )}

          {/* Self-Awareness Breakdown */}
          {intel?.selfAwareness && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
              <SectionHeader title="Self-Awareness" color="text-emerald-400" />
              <div className="grid grid-cols-2 gap-1.5">
                <MiniCard label="Strengths" value={String(intel.selfAwareness.strengths)} color="text-emerald-400" />
                <MiniCard label="Weaknesses" value={String(intel.selfAwareness.weaknesses)} color="text-red-400" />
                <MiniCard label="Meta Confidence" value={`${intel.selfAwareness.metaConfidence.toFixed(0)}%`} />
                <MiniCard label="Trend" value={intel.selfAwareness.trend} color={intel.selfAwareness.trend === 'IMPROVING' ? 'text-emerald-400' : intel.selfAwareness.trend === 'DECLINING' ? 'text-red-400' : 'text-yellow-400'} />
              </div>
            </div>
          )}

          {/* Synaptic Activity */}
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3">
            <SectionHeader title="Synaptic Activity" color="text-slate-400" />
            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
              {thoughtLog.map((t, i) => (
                <div key={i} className="text-[8px] text-slate-500 font-mono border-b border-slate-800/30 pb-1 last:border-0">{t}</div>
              ))}
              {thoughtLog.length === 0 && <div className="text-[8px] text-slate-700 text-center py-4">Awaiting neural activity...</div>}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[7px] font-mono text-slate-600">
        <span>🧠 Cortex v2.0</span>
        <span>·</span>
        <span>⚡ {intel?.engine?.running ? 'Operational' : 'Standby'}</span>
        <span>·</span>
        <span>📊 Predictions: {accuracy?.totalPredictions || 0}</span>
        {intel?.engine && (
          <><span>·</span><span>⚙️ {intel.engine.quotesPerMin}qpm · {intel.engine.newsPerHour}nph</span></>
        )}
        {intel?.autonomous24x7 && (
          <><span>·</span><span>🏋️ {intel.autonomous24x7.serverWeightSamples} weight samples</span></>
        )}
        <span>·</span>
        <span className={pricesStreaming ? 'text-emerald-400' : 'text-slate-600'}>{pricesStreaming ? '● LIVE FEED' : '○ MARKET CLOSED'}</span>
      </div>
    </div>
  );
}
