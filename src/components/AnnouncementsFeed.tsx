'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SignalCard from './SignalCard';
import SignalDrawer from './SignalDrawer';

interface Announcement {
  id: string;
  symbol: string;
  company: string;
  headline: string;
  full_text: string;
  category: string;
  announcement_time: string;
  capture_latency_seconds: number;
  attachment_url: string;
  exchange: string;
  
  ai_analysis: {
    finbert_sentiment: string;
    finbert_confidence: number;
    llm_sentiment: string;
    llm_confidence: number;
    llm_reasoning: string;
    ensemble_signal: string;
    ensemble_confidence: number;
    event_type?: string;
    trading_signal?: string;
    expected_movement_pct?: string;
  };
  
  prediction: {
    direction: string;
    expected_range_pct: { min: number; max: number };
    time_horizon: string;
    momentum_score: number;
    risk_score: number;
  };
  
  similar_historical: {
    count: number;
    avg_1d_change: number;
    avg_5d_change: number;
    accuracy_rate: number;
  };
  
  context: {
    pe_ratio: number | null;
    pe_bracket: string;
    sector: string;
    current_price?: string;
    day_change_pct?: string;
    volume_surge_ratio?: string;
  };
  
  received_at: string;
  flash?: boolean;
}

interface AnnouncementsFeedProps {
  wsUrl?: string;
  maxItems?: number;
  showPEBadges?: boolean;
}

export default function AnnouncementsFeed({
  maxItems = 200,
  showPEBadges = true,
}: AnnouncementsFeedProps) {
  const restUrl = '/api/news';
  const [items, setItems] = useState<Announcement[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'all'>('all');
  const [selectedSignal, setSelectedSignal] = useState<any>(null);
  const [pipelineStats, setPipelineStats] = useState({
    fetched: 0,
    passedFilters: 0,
    highImpact: 0,
    telegramSent: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const getSignalColor = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('strong_buy')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('buy')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (s.includes('avoid')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (s.includes('sell')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getPEPillColor = (bracket: string) => {
    switch (bracket) {
      case 'value': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'growth': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'hype': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  // Disable WebSocket to use native Next.js REST API
  useEffect(() => {
    setConnected(true);
    setError(null);
  }, []);

  const fetchRestFallback = useCallback(async () => {
    try {
      const res = await fetch(restUrl);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.news) {
        
        // Update Pipeline Stats
        const fetched = data.count || 0;
        const llmAnalyzed = data.llmEnhancedCount || 0;
        const passedFilters = data.news?.filter((n:any) => n.llmImpactLevel?.includes('HIGH') || n.llmTradingSignal !== 'IGNORE').length || 0;
        const telegramSent = data.news?.filter((n:any) => n.llmTradingSignal === 'BUY' || n.llmTradingSignal === 'SELL').length || 0;

        setPipelineStats({
          fetched: fetched,
          passedFilters: passedFilters,
          highImpact: llmAnalyzed,
          telegramSent: telegramSent
        });

        // RUTHLESS FILTER: Show ALL verified high-impact announcements (Corporate or Macro)
        const isImpactful = (item: any) => {
          if (item.verificationScore !== undefined && item.verificationScore < 70) return false;
          if (item.llmTradingSignal === 'IGNORE') return false;
          return true; 
        };

        const mappedNews = data.news.filter(isImpactful).map((item: any) => ({
          id: item.id,
          symbol: item.tickers?.[0] || 'MACRO',
          company_name: item.source || 'News',
          headline: item.headline,
          summary: item.summary,
          sentiment: item.sentiment,
          confidence: Math.round(item.impactScore),
          ensemble_signal: item.llmImpactLevel?.toLowerCase().includes('high') ? 'BUY' : 'NEUTRAL',
          full_text: item.summary || '',
          category: 'General',
          announcement_time: new Date(item.timestamp).toISOString(),
          capture_latency_seconds: 0,
          attachment_url: item.url || '',
          exchange: 'NSE',
          ai_analysis: {
            finbert_sentiment: item.sentiment || 'neutral',
            finbert_confidence: item.impactScore || 0,
            llm_sentiment: item.sentiment || 'neutral',
            llm_confidence: item.impactScore || 0,
            llm_reasoning: item.llmReasoning || item.summary || '',
            ensemble_signal: item.llmImpactLevel?.toLowerCase().includes('high') ? 'BUY' : 'NEUTRAL',
            ensemble_confidence: item.impactScore || 0,
            event_type: item.llmEventType || 'GENERAL',
            trading_signal: item.llmTradingSignal || 'IGNORE',
            expected_movement_pct: item.llmExpectedMovementPct || 'N/A',
          },
          prediction: {
            direction: 'neutral',
            expected_range_pct: { min: 0, max: 0 },
            time_horizon: '1d',
            momentum_score: 0,
            risk_score: 0
          },
          similar_historical: {
            count: 0,
            avg_1d_change: 0,
            avg_5d_change: 0,
            accuracy_rate: 0
          },
          context: {
            pe_ratio: null,
            pe_bracket: 'neutral',
            sector: 'unknown'
          },
          verificationScore: item.verificationScore,
          verificationSources: item.verificationSources,
          received_at: new Date(item.timestamp).toISOString()
        }));
        
        setItems(prev => {
          const newItems = mappedNews.filter((item: Announcement) => !prev.some(p => p.id === item.id || p.headline === item.headline));
          if (newItems.length === 0) return prev;
          
          const withFlash = newItems.map((item: Announcement) => ({ ...item, flash: true }));
          const updated = [...withFlash, ...prev].slice(0, maxItems);
          
          setTimeout(() => {
            setItems(current =>
              current.map(item =>
                newItems.some((n: Announcement) => n.id === item.id) ? { ...item, flash: false } : item
              )
            );
          }, 2000);
          
          return updated;
        });
        setConnected(true);
      }
    } catch (e) {
      setError('Live feed offline - Reconnecting...');
      setConnected(false);
    }
  }, [restUrl, maxItems]);

  useEffect(() => {
    setConnected(false);
    setError('Connected to Next.js native Engine (Live)');
  }, []); 

  useEffect(() => {
    const interval = setInterval(fetchRestFallback, 5000);
    return () => clearInterval(interval);
  }, [fetchRestFallback]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (dateFilter === 'all') return true;
      const itemDate = new Date(item.announcement_time);
      const today = new Date();
      if (dateFilter === 'today') {
        return itemDate.getDate() === today.getDate() && itemDate.getMonth() === today.getMonth() && itemDate.getFullYear() === today.getFullYear();
      }
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (dateFilter === 'yesterday') {
        return itemDate.getDate() === yesterday.getDate() && itemDate.getMonth() === yesterday.getMonth() && itemDate.getFullYear() === yesterday.getFullYear();
      }
      
      return true;
    });
  }, [items, dateFilter]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className="text-xl">📡</span>
            Live Announcements Feed
          </h2>
          <p className="text-[9px] text-slate-500 font-mono mt-1 mb-2">
            NSE/BSE corporate announcements with AI Analysis & PE Context
          </p>
          <div className="flex gap-4 mb-2">
            <div className="text-[10px] font-mono"><span className="text-slate-500">Fetched:</span> <span className="text-white font-bold">{pipelineStats.fetched}</span></div>
            <div className="text-[10px] font-mono"><span className="text-slate-500">Passed Filters:</span> <span className="text-white font-bold">{pipelineStats.passedFilters}</span></div>
            <div className="text-[10px] font-mono"><span className="text-slate-500">High Impact:</span> <span className="text-white font-bold">{pipelineStats.highImpact}</span></div>
            <div className="text-[10px] font-mono"><span className="text-slate-500">Telegram Sent:</span> <span className="text-white font-bold">{pipelineStats.telegramSent}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded-full border ${
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? 'LIVE' : 'DISCONNECTED'}
          </span>
          <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
            {(['all', 'today', 'yesterday'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`text-[9px] font-mono px-2.5 py-1 rounded-md transition-colors ${
                  dateFilter === f
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setItems([])}
            className="text-[8px] font-mono text-slate-500 hover:text-white px-2 py-1 rounded-lg border border-slate-700/50 hover:border-slate-600"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[9px] font-mono text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1 custom-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500 font-mono text-xs">
            {connected ? 'Waiting for verified corporate catalysts...' : 'Connecting to feed...'}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-[10px] font-bold text-emerald-400 font-mono tracking-widest uppercase mb-3 pb-1 border-b border-slate-800">
                Order Wins & Business Growth (For Sudden Price Rallies)
              </h3>
              <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.filter(i => i.ai_analysis.event_type === 'ORDER_WIN').length === 0 ? (
                  <div className="text-slate-700 font-mono text-[9px] italic py-2 col-span-full">Scanning for active growth catalysts...</div>
                ) : (
                  filteredItems.filter(i => i.ai_analysis.event_type === 'ORDER_WIN').map((item) => (
                    <SignalCard key={item.id} item={item} onClick={setSelectedSignal} />
                  ))
                )}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-[10px] font-bold text-purple-400 font-mono tracking-widest uppercase mb-3 pb-1 border-b border-slate-800">
                Corporate Action & Inside Confidence (For Institutional Buying)
              </h3>
              <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.filter(i => i.ai_analysis.event_type === 'CORPORATE_ACTION').length === 0 ? (
                  <div className="text-slate-700 font-mono text-[9px] italic py-2 col-span-full">Scanning for institutional actions...</div>
                ) : (
                  filteredItems.filter(i => i.ai_analysis.event_type === 'CORPORATE_ACTION').map((item) => (
                    <SignalCard key={item.id} item={item} onClick={setSelectedSignal} />
                  ))
                )}
              </div>
            </div>

            <div className="mb-2">
              <h3 className="text-[10px] font-bold text-amber-400 font-mono tracking-widest uppercase mb-3 pb-1 border-b border-slate-800">
                Debt & Financial Turnarounds (For Broken/Penny Stocks)
              </h3>
              <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.filter(i => i.ai_analysis.event_type === 'TURNAROUND').length === 0 ? (
                  <div className="text-slate-700 font-mono text-[9px] italic py-2 col-span-full">Scanning for turnaround catalysts...</div>
                ) : (
                  filteredItems.filter(i => i.ai_analysis.event_type === 'TURNAROUND').map((item) => (
                    <SignalCard key={item.id} item={item} onClick={setSelectedSignal} />
                  ))
                )}
              </div>
            </div>

            <div className="mb-2">
              <h3 className="text-[10px] font-bold text-blue-400 font-mono tracking-widest uppercase mb-3 pb-1 border-b border-slate-800">
                Other High-Impact Signals (Macro / General)
              </h3>
              <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.filter(i => !['ORDER_WIN', 'CORPORATE_ACTION', 'TURNAROUND'].includes(i.ai_analysis?.event_type || '')).length === 0 ? (
                  <div className="text-slate-700 font-mono text-[9px] italic py-2 col-span-full">Scanning for macro events...</div>
                ) : (
                  filteredItems.filter(i => !['ORDER_WIN', 'CORPORATE_ACTION', 'TURNAROUND'].includes(i.ai_analysis?.event_type || '')).map((item) => (
                    <SignalCard key={item.id} item={item} onClick={setSelectedSignal} />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <SignalDrawer item={selectedSignal} onClose={() => setSelectedSignal(null)} />
    </div>
  );
}
