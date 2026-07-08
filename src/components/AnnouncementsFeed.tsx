'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SignalCard from './SignalCard';
import SignalDrawer from './SignalDrawer';
import { verifySource, classifyEventType, type VerificationResult } from '@/lib/sourceVerificationEngine';
import { getCachedAnnouncements, cacheAnnouncement, cacheAnnouncementBatch } from '@/lib/announcementCache';
import { saveAnnouncement, saveAnnouncementBatch, getDailyCounts, getAnnouncementsByDate, getTotalAnnouncementCount } from '@/lib/announcementDB';
import { sendAnnouncementAlert } from '@/lib/telegramBot';
import { useToast } from './ToastProvider';
import { startAnnouncementLearning, type LearningInsight, getLastLearningInsight } from '@/lib/announcementLearning';

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
  
  v5_intelligence?: {
    event_category: string;
    importance: number;
    accumulation_prob: number;
    historical_win_rate: number;
    forecasts: {
      prob_1day: number;
      prob_1week: number;
      expected_return: number;
    };
    decision_trace: {
      decision_id: string;
      model_version: string;
      prediction: string;
      confidence_tier: string;
      reasoning: string;
    };
  };
  
  received_at: string;
  flash?: boolean;
  verification?: VerificationResult;
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
  const [items, setItems] = useState<Announcement[]>(() => {
    const cached = getCachedAnnouncements();
    return cached.length > 0 ? cached.slice(0, maxItems) : [];
  });
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

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [dailyCounts, setDailyCounts] = useState<Record<number, number>>({});
  const [totalStored, setTotalStored] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    getDailyCounts(calendarMonth.getFullYear(), calendarMonth.getMonth()).then(setDailyCounts);
  }, [calendarMonth]);

  useEffect(() => {
    getTotalAnnouncementCount().then(setTotalStored);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const [learningInsight, setLearningInsight] = useState<LearningInsight | null>(null);
  const [showLearning, setShowLearning] = useState(false);

  useEffect(() => {
    const existing = getLastLearningInsight();
    if (existing) setLearningInsight(existing);
    const stop = startAnnouncementLearning(setLearningInsight);
    return stop;
  }, []);

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

  function classifyAndMapEventType(item: Announcement): string {
    const existing = item.ai_analysis?.event_type;
    if (['ORDER_WIN', 'CORPORATE_ACTION', 'TURNAROUND'].includes(existing || '')) {
      return existing!;
    }
    const specificType = classifyEventType(item.headline, item.full_text || '');
    if (specificType === 'ORDER_WIN' || specificType === 'CONTRACT_WIN') return 'ORDER_WIN';
    const corporateEvents = [
      'ACQUISITION', 'MERGER', 'BONUS', 'SPLIT', 'DIVIDEND', 'BUYBACK',
      'EARNINGS_BEAT', 'EARNINGS_MISS', 'REVENUE_GROWTH', 'PROFIT_SURGE', 'LOSS_WIDEN',
      'FDA_APPROVAL', 'REGULATORY_CLEARANCE', 'SEBI_ACTION', 'TAX_NOTICE', 'COURT_ORDER',
      'MANAGEMENT_CHANGE', 'RESIGNATION', 'APPOINTMENT',
      'BLOCK_DEAL', 'BULK_DEAL', 'PROMOTER_BUYING', 'PROMOTER_SELLING', 'PLEDGE_CHANGE',
      'NEW_PRODUCT', 'EXPANSION', 'JV_ANNOUNCEMENT'
    ];
    if (corporateEvents.includes(specificType)) return 'CORPORATE_ACTION';
    const turnaroundEvents = ['DEBT_REDUCTION', 'FUND_RAISING', 'CREDIT_UPGRADE', 'CREDIT_DOWNGRADE'];
    if (turnaroundEvents.includes(specificType)) return 'TURNAROUND';
    return existing || specificType;
  }

  // Use WebSocket to connect directly to the Python V5 Engine
  useEffect(() => {
    connectRef.current = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      
      const socket = new WebSocket('ws://localhost:8000/ws/announcements');
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // If it's a history payload (list of items)
          if (Array.isArray(data)) {
            const verified = data.map((item: any) => {
              const announcement = item as Announcement;
              const mappedType = classifyAndMapEventType(announcement);
              return {
                ...item,
                ai_analysis: {
                  ...(item.ai_analysis || {}),
                  event_type: mappedType
                },
                verification: verifySource(
                  item.headline || '',
                  item.source || mappedType || 'UNKNOWN',
                  item.received_at ? new Date(item.received_at).getTime() : Date.now(),
                  'INDIAN'
                ),
              };
            });
            cacheAnnouncementBatch(verified);
            saveAnnouncementBatch(verified).then(count => {
              if (count > 0) setTotalStored(prev => prev + count);
              getDailyCounts(calendarMonth.getFullYear(), calendarMonth.getMonth()).then(setDailyCounts);
            });
            setItems(verified);
            if (verified.length > 0) {
              toast('info', `Loaded ${verified.length} announcements`, `From V5 Engine history`, 3000);
            }
          } else if (data.symbol) {
            // Single announcement with verification
            const mappedType = classifyAndMapEventType(data as Announcement);
            const verification = verifySource(
              data.headline || '',
              data.source || mappedType || 'UNKNOWN',
              data.received_at ? new Date(data.received_at).getTime() : Date.now(),
              'INDIAN'
            );
            setItems(prev => {
              if (prev.some(p => p.id === data.id)) return prev;
              const newItem = {
                ...data,
                flash: true,
                verification,
                ai_analysis: {
                  ...(data.ai_analysis || {}),
                  event_type: mappedType
                }
              };
              cacheAnnouncement(newItem);
              saveAnnouncement(newItem);
              
              const cat = mappedType || data.category || 'GENERAL';
              const sig = data.ai_analysis?.trading_signal || data.prediction?.direction || '';
              toast(
                sig === 'BUY' || sig === 'STRONG_BUY' ? 'success' :
                sig === 'SELL' || sig === 'STRONG_SELL' ? 'warning' : 'info',
                `${data.symbol} — ${cat.replace(/_/g, ' ')}`,
                data.headline?.slice(0, 120),
                5000
              );
              
              sendAnnouncementAlert({
                id: data.id,
                symbol: data.symbol,
                company: data.company || data.symbol,
                headline: data.headline || '',
                category: cat,
                ai_analysis: data.ai_analysis,
                prediction: data.prediction,
              });
              
              setPipelineStats(prev => ({
                ...prev,
                telegramSent: prev.telegramSent + 1,
              }));
              
              setTimeout(() => {
                setItems(current =>
                  current.map(item =>
                    item.id === newItem.id ? { ...item, flash: false } : item
                  )
                );
              }, 2000);
              
              return [newItem, ...prev].slice(0, maxItems);
            });
            
            setPipelineStats(prev => ({
              ...prev,
              fetched: prev.fetched + 1,
              passedFilters: prev.passedFilters + 1
            }));
          }
        } catch (e) {
          console.error("WebSocket parsing error:", e);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        setError('Connection to V5 Engine lost. Reconnecting...');
        reconnectTimeoutRef.current = setTimeout(connectRef.current, 5000);
      };

      socket.onerror = (err) => {
        setConnected(false);
        setError('V5 Engine Connection Error');
      };
    };

    connectRef.current();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [maxItems]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedDate) {
        const itemDate = new Date(item.announcement_time);
        const sd = new Date(selectedDate + 'T00:00:00.000Z');
        return itemDate.getDate() === sd.getDate() && itemDate.getMonth() === sd.getMonth() && itemDate.getFullYear() === sd.getFullYear();
      }
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
  }, [items, dateFilter, selectedDate]);

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
            <div className="text-[10px] font-mono"><span className="text-slate-500">Stored:</span> <span className="text-white font-bold">{totalStored}</span></div>
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
                onClick={() => { setDateFilter(f); setSelectedDate(null); }}
                className={`text-[9px] font-mono px-2.5 py-1 rounded-md transition-colors ${
                  !selectedDate && dateFilter === f
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`text-[9px] font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                selectedDate
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'text-slate-400 hover:text-white border-slate-700/50 hover:border-slate-600'
              }`}
            >
              {selectedDate || 'DATE'}
            </button>
            {showCalendar && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl shadow-black/50 w-64">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="text-slate-400 hover:text-white text-[10px] px-1">◀</button>
                  <span className="text-[10px] font-mono text-white font-bold">{calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="text-slate-400 hover:text-white text-[10px] px-1">▶</button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-[7px] font-mono text-slate-600 py-1">{d}</div>
                  ))}
                  {(() => {
                    const year = calendarMonth.getFullYear();
                    const month = calendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) {
                      cells.push(<div key={`e${i}`} />);
                    }
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const count = dailyCounts[d] || 0;
                      const isSelected = selectedDate === dateStr;
                      const isToday = dateStr === todayStr;
                      cells.push(
                        <button
                          key={d}
                          onClick={() => { setSelectedDate(dateStr); setDateFilter('all'); setShowCalendar(false); }}
                          className={`relative text-[9px] font-mono py-1.5 rounded-md transition-colors ${
                            isSelected
                              ? 'bg-blue-500/30 text-blue-300'
                              : isToday
                              ? 'bg-slate-700/50 text-white'
                              : 'text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {d}
                          {count > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-emerald-500 text-white text-[5px] rounded-full w-3 h-3 flex items-center justify-center font-bold">
                              {count > 9 ? '9+' : count}
                            </span>
                          )}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => { setItems([]); setSelectedDate(null); }}
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

      {learningInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5">
          <button
            onClick={() => setShowLearning(!showLearning)}
            className="w-full flex items-center justify-between p-3 text-[9px] font-mono text-indigo-300"
          >
            <span>🧠 AI Learning — {learningInsight.totalAnalyzed} announcements analyzed</span>
            <span className="text-slate-500">{showLearning ? '▲' : '▼'}</span>
          </button>
          {showLearning && (
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Top Categories</div>
                {learningInsight.topCategories.slice(0, 5).map(c => (
                  <div key={c.category} className="flex justify-between text-[8px] font-mono py-0.5">
                    <span className="text-slate-300">{c.category.replace(/_/g, ' ')}</span>
                    <span className="text-indigo-400">{c.count} ({c.winRate}%)</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Sector Activity</div>
                {learningInsight.sectorActivity.slice(0, 5).map(s => (
                  <div key={s.sector} className="flex justify-between text-[8px] font-mono py-0.5">
                    <span className="text-slate-300">{s.sector}</span>
                    <span className="text-indigo-400">{s.count} ({s.avgScore})</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Signal Breakdown</div>
                {learningInsight.signalBreakdown.map(s => (
                  <div key={s.signal} className="flex justify-between text-[8px] font-mono py-0.5">
                    <span className="text-slate-300">{s.signal.replace(/_/g, ' ')}</span>
                    <span className="text-indigo-400">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    <div key={item.id} className="relative">
                      {item.verification && (
                        <div className={`absolute -top-1 -right-1 z-10 px-1.5 py-0.5 rounded-full text-[6px] font-bold font-mono border ${
                          item.verification.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : item.verification.status === 'UNVERIFIED'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {item.verification.status === 'VERIFIED' ? '✓ VERIFIED' :
                           item.verification.status === 'UNVERIFIED' ? '? UNVERIFIED' : '✗ REJECTED'}
                        </div>
                      )}
                      <SignalCard item={item} onClick={setSelectedSignal} />
                    </div>
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
                    <div key={item.id} className="relative">
                      {item.verification && (
                        <div className={`absolute -top-1 -right-1 z-10 px-1.5 py-0.5 rounded-full text-[6px] font-bold font-mono border ${
                          item.verification.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : item.verification.status === 'UNVERIFIED'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {item.verification.status === 'VERIFIED' ? '✓ VERIFIED' :
                           item.verification.status === 'UNVERIFIED' ? '? UNVERIFIED' : '✗ REJECTED'}
                        </div>
                      )}
                      <SignalCard item={item} onClick={setSelectedSignal} />
                    </div>
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
                    <div key={item.id} className="relative">
                      {item.verification && (
                        <div className={`absolute -top-1 -right-1 z-10 px-1.5 py-0.5 rounded-full text-[6px] font-bold font-mono border ${
                          item.verification.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : item.verification.status === 'UNVERIFIED'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {item.verification.status === 'VERIFIED' ? '✓ VERIFIED' :
                           item.verification.status === 'UNVERIFIED' ? '? UNVERIFIED' : '✗ REJECTED'}
                        </div>
                      )}
                      <SignalCard item={item} onClick={setSelectedSignal} />
                    </div>
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
                    <div key={item.id} className="relative">
                      {item.verification && (
                        <div className={`absolute -top-1 -right-1 z-10 px-1.5 py-0.5 rounded-full text-[6px] font-bold font-mono border ${
                          item.verification.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : item.verification.status === 'UNVERIFIED'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {item.verification.status === 'VERIFIED' ? '✓ VERIFIED' :
                           item.verification.status === 'UNVERIFIED' ? '? UNVERIFIED' : '✗ REJECTED'}
                        </div>
                      )}
                      <SignalCard item={item} onClick={setSelectedSignal} />
                    </div>
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
