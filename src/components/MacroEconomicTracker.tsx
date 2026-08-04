'use client';

import React, { useEffect, useState } from 'react';
import { TerminalIcon } from '@/components/icons/TerminalIcons';

interface EconEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  time: string;
  timestamp: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  actual?: string;
  forecast?: string;
  previous?: string;
}

interface InvestopediaItem {
  title: string;
  link: string;
}

export function MacroEconomicTracker() {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [news, setNews] = useState<InvestopediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fetchMacro = async () => {
      try {
        const res = await fetch('/api/economic-calendar');
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        setEvents(data.events || []);
        setNews(data.investopedia || []);
      } catch (e) {
        console.error('Failed to fetch macro data', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMacro();
    const interval = setInterval(fetchMacro, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="w-full h-32 flex items-center justify-center bg-gray-900/50 rounded-xl border border-gray-800 backdrop-blur-sm animate-pulse">
        <TerminalIcon name="globe" size={24} className="text-indigo-400 opacity-50" />
      </div>
    );
  }

  if (events.length === 0 && news.length === 0) return null;

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* ForexFactory Events */}
      <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        <div className="flex items-center gap-2 mb-4">
          <TerminalIcon name="clock" size={20} className="text-indigo-400" />
          <h3 className="font-semibold text-gray-100 tracking-wide text-sm">Upcoming Macro Events</h3>
          <span className="ml-auto text-[10px] text-gray-500 font-mono tracking-widest uppercase">ForexFactory</span>
        </div>
        
        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No high impact events pending.</p>
          ) : (
            events.map((e) => {
              const dateObj = new Date(e.timestamp);
              const isToday = dateObj.toDateString() === new Date().toDateString();
              const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              return (
                <div key={e.id} className="flex items-center gap-3 bg-gray-800/30 p-2.5 rounded-lg border border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                  <div className={`w-1.5 h-full rounded-full self-stretch ${e.impact === 'HIGH' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-orange-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded">{e.country}</span>
                      <span className="text-sm font-medium text-gray-200 truncate">{e.title}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-gray-400 font-mono">
                        {isToday ? 'Today' : dateObj.toLocaleDateString(undefined, { weekday: 'short' })} {timeStr}
                      </span>
                      {(e.forecast || e.previous) && (
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          F: {e.forecast || '--'} | P: {e.previous || '--'}
                        </span>
                      )}
                    </div>
                  </div>
                  {e.impact === 'HIGH' && <TerminalIcon name="alert" size={16} className="text-red-500/70 animate-pulse flex-shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Investopedia Headlines */}
      <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        <div className="flex items-center gap-2 mb-4">
          <TerminalIcon name="activity" size={20} className="text-emerald-400" />
          <h3 className="font-semibold text-gray-100 tracking-wide text-sm">Market Intelligence</h3>
          <span className="ml-auto text-[10px] text-gray-500 font-mono tracking-widest uppercase">Investopedia</span>
        </div>

        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {news.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No recent headlines.</p>
          ) : (
            news.map((item, idx) => (
              <a 
                key={idx} 
                href={item.link} 
                target="_blank" 
                rel="noreferrer"
                className="group flex flex-col gap-1 bg-gray-800/30 p-2.5 rounded-lg border border-gray-800/50 hover:bg-gray-800/70 hover:border-emerald-500/30 transition-all"
              >
                <span className="text-sm font-medium text-gray-300 group-hover:text-emerald-300 transition-colors line-clamp-2 leading-tight">
                  {item.title}
                </span>
                <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                  Read Article &rarr;
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
