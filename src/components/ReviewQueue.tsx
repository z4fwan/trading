import React, { useState, useEffect } from 'react';
import { type ReviewQueueItem } from '@/lib/reviewQueueStore';

export default function ReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch('/api/review-queue');
        if (res.ok) {
          const data = await res.json();
          setItems(data.items);
        }
      } catch (e) {
        // silently fail
      }
    };
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-700 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        Human Review Queue
      </h2>
      <p className="text-slate-400 text-sm mb-6">
        Exceptional events requiring manual override, annotation, or approval.
      </p>

      {items.length === 0 ? (
        <div className="text-center py-10 text-slate-500 italic">No events pending review.</div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className={`bg-slate-800 rounded-lg p-5 border transition-colors relative overflow-hidden ${
              item.status === 'PENDING' ? 'border-amber-500/30 hover:border-amber-500/60' :
              item.status.includes('APPROVE') ? 'border-emerald-500/30' : 'border-red-500/30'
            }`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${
                item.status === 'PENDING' ? 'bg-amber-500' :
                item.status.includes('APPROVE') ? 'bg-emerald-500' : 'bg-red-500'
              }`}></div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${
                    item.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400' :
                    item.status.includes('APPROVE') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-slate-400 ml-3">{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-xs text-slate-500 font-mono">{item.id}</div>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">{item.description}</p>
              
              {item.aiDeepStudy && (
                <div className="mb-4 bg-slate-950 p-4 rounded-lg border border-slate-700/50">
                  <div className="text-xs font-bold text-blue-400 mb-2 font-mono flex items-center gap-2">
                    <span>🧠</span> AI DEEP STUDY ANNOTATION
                  </div>
                  <p className="text-sm text-slate-300 italic font-mono leading-relaxed">"{item.aiDeepStudy}"</p>
                </div>
              )}
              
              {item.status === 'PENDING' && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700/50">
                  <button className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-medium rounded transition-colors">
                    Approve Signal
                  </button>
                  <button className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded transition-colors">
                    Reject (Risk Off)
                  </button>
                  <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors">
                    Annotate & Forward
                  </button>
                  <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors">
                    Escalate
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
