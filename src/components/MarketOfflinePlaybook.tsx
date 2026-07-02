'use client';

import { useEffect, useState } from 'react';

export default function MarketOfflinePlaybook() {
  const [playbook, setPlaybook] = useState<string | null>(null);
  const [age, setAge] = useState<string>('');

  useEffect(() => {
    // Only check once or occasionally, no need for heavy polling
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.offline?.playbook) {
          setPlaybook(data.offline.playbook);
          setAge(data.offline.lastAnalysisAge || '');
        }
      } catch (err) {
        // silently fail
      }
    };
    
    fetchHealth();
    const t = setInterval(fetchHealth, 5 * 60 * 1000); // 5 min
    return () => clearInterval(t);
  }, []);

  if (!playbook) return null;

  const playAudio = () => {
    if (!playbook || typeof window === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(playbook.replace(/[*#]/g, ''));
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.0;
    
    // Attempt to find an English/Indian voice
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(v => v.lang.includes('en-IN')) || voices.find(v => v.lang.includes('en-US'));
    if (indianVoice) utterance.voice = indianVoice;
    
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="terminal-card bg-slate-900 border-indigo-500/30 p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
        <svg className="w-24 h-24 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7H2v-2l1-5h18l1 5v2h-1zM5 13v6h14v-6H5zm-.96-2h15.92l-.6-3H4.64l-.6 3zM6 14h12v2H6v-2z" />
        </svg>
      </div>

      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
          </span>
          <h3 className="text-sm font-bold text-indigo-300 font-mono tracking-widest uppercase shadow-sm">
            Offline AI Retrospective & Open Plan
          </h3>
          {age && <span className="text-[10px] text-slate-500 font-mono">Generated {age}</span>}
        </div>
        <button
          onClick={playAudio}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 rounded-lg text-xs font-bold font-mono transition-colors"
        >
          🔊 Play Briefing
        </button>
      </div>
      
      <div className="prose prose-invert prose-sm max-w-none prose-ul:my-1 prose-li:my-0.5 text-slate-300 font-mono text-[11px] leading-relaxed relative z-10">
        {playbook.split('\n').map((line, i) => (
          <div key={i} className={`${line.startsWith('-') ? 'ml-3' : 'mb-1'} ${line.includes('**') ? 'font-bold text-indigo-200' : ''}`}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
