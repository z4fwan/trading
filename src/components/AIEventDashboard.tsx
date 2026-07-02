import React, { useState } from 'react';
import AnnouncementsFeed from './AnnouncementsFeed';
import ReviewQueue from './ReviewQueue';
import SystemHealth from './SystemHealth';

type Tab = 'LIVE_SIGNALS' | 'RESEARCH' | 'REPLAY' | 'PERFORMANCE' | 'REVIEW_QUEUE' | 'SYSTEM_HEALTH';

export default function AIEventDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('LIVE_SIGNALS');

  return (
    <div className="w-full flex flex-col h-full bg-slate-950">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-2 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('LIVE_SIGNALS')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
            activeTab === 'LIVE_SIGNALS'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Live Signals
        </button>
        <button
          onClick={() => setActiveTab('RESEARCH')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
            activeTab === 'RESEARCH'
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Research
        </button>
        <button
          onClick={() => setActiveTab('REPLAY')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
            activeTab === 'REPLAY'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Replay
        </button>
        <button
          onClick={() => setActiveTab('PERFORMANCE')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
            activeTab === 'PERFORMANCE'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Performance
        </button>
        <button
          onClick={() => setActiveTab('REVIEW_QUEUE')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center gap-2 ${
            activeTab === 'REVIEW_QUEUE'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Review Queue
          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">1</span>
        </button>
        <button
          onClick={() => setActiveTab('SYSTEM_HEALTH')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
            activeTab === 'SYSTEM_HEALTH'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          System Health
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'LIVE_SIGNALS' && (
          <div className="animate-in fade-in duration-300">
            <AnnouncementsFeed />
          </div>
        )}
        {activeTab === 'RESEARCH' && (
          <div className="animate-in fade-in duration-300 bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
            <h2 className="text-xl font-bold text-white mb-4">Research Workspace</h2>
            <p className="text-slate-500 font-mono text-sm">Historical analogs and macro evaluation tools will load here.</p>
          </div>
        )}
        {activeTab === 'REPLAY' && (
          <div className="animate-in fade-in duration-300 bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Replay Engine</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h3 className="text-slate-400 text-sm mb-2">Model Registry</h3>
                <p className="text-white font-mono">ID: 2026.07.02.001</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h3 className="text-slate-400 text-sm mb-2">Latest Replay Metrics</h3>
                <p className="text-green-400 font-mono">Precision: 82.4% | Recall: 78.1%</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'PERFORMANCE' && (
          <div className="animate-in fade-in duration-300 bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
            <h2 className="text-xl font-bold text-white mb-4">Calibration & Performance</h2>
            <p className="text-slate-500 font-mono text-sm">Reliability curves and drift alerts will render here.</p>
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
