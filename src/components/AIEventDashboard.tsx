import React, { useState, useEffect } from 'react';
import AnnouncementsFeed from './AnnouncementsFeed';
import ReviewQueue from './ReviewQueue';
import SystemHealth from './SystemHealth';

type Tab = 'LIVE_SIGNALS' | 'REVIEW_QUEUE' | 'SYSTEM_HEALTH';

const TABS: { key: Tab; label: string; desc: string; color: string }[] = [
  { key: 'LIVE_SIGNALS', label: 'Live Signals', desc: 'Real-time corporate announcements with AI analysis', color: 'blue' },
  { key: 'REVIEW_QUEUE', label: 'Review Queue', desc: 'Pending signals requiring manual review', color: 'red' },
  { key: 'SYSTEM_HEALTH', label: 'System Health', desc: 'Pipeline status and engine diagnostics', color: 'cyan' },
];

export default function AIEventDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('LIVE_SIGNALS');
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    fetch('/api/review-queue').then(r => r.json()).then(d => {
      setQueueCount(d.items?.length ?? 0);
    }).catch(() => {});
    const t = setInterval(() => {
      fetch('/api/review-queue').then(r => r.json()).then(d => {
        setQueueCount(d.items?.length ?? 0);
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="w-full flex flex-col h-full bg-slate-950">
      <div className="flex items-end justify-between border-b border-slate-800 pb-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full bg-${activeTabConfig.color}-500 animate-pulse`} />
            {activeTabConfig.label}
          </h2>
          <p className="text-[9px] text-slate-500 font-mono mt-1">{activeTabConfig.desc}</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? `bg-${tab.color}-500/20 text-${tab.color}-400 border border-${tab.color}-500/30 shadow-sm`
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
              {tab.key === 'REVIEW_QUEUE' && queueCount > 0 && (
                <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">{queueCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'LIVE_SIGNALS' && (
          <div className="animate-in fade-in duration-300">
            <AnnouncementsFeed />
          </div>
        )}
        {activeTab === 'REVIEW_QUEUE' && (
          <div className="animate-in fade-in duration-300">
            <ReviewQueue />
          </div>
        )}
        {activeTab === 'SYSTEM_HEALTH' && (
          <div className="animate-in fade-in duration-300">
            <SystemHealth />
          </div>
        )}
      </div>
    </div>
  );
}
