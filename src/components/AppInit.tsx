'use client';
import { useEffect, useState } from 'react';
import { setupGlobalErrorHandling } from '@/lib/errorTracker';
import { initializeDatabase } from '@/lib/dataSync';
import { hydrateWeightsFromCloud } from '@/lib/ai/knowledgeBase';
import { hydrateNewsFromDB } from '@/lib/newsStore';
import { hydrateExperienceFromDB } from '@/lib/aiExperienceEngine';
import { fullSync, getSyncStatus, onSyncStatusChange } from '@/lib/syncEngine';

export default function AppInit({ children }: { children: React.ReactNode }) {
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());

  useEffect(() => {
    const unsub = onSyncStatusChange(setSyncStatus);
    return unsub;
  }, []);

  useEffect(() => {
    try {
      const cleanup = setupGlobalErrorHandling();
      initializeDatabase().catch(() => {});
      hydrateWeightsFromCloud().catch(() => {});
      hydrateNewsFromDB().catch(() => {});
      hydrateExperienceFromDB().catch(() => {});
      return () => cleanup();
    } catch { /* app init failure */ }
  }, []);

  // Run sync on first mount (runs after 2s delay to let app settle)
  useEffect(() => {
    const t = setTimeout(() => { fullSync().catch(() => {}); }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {syncStatus === 'syncing' && (
        <div className="fixed top-2 right-2 z-[9999] bg-slate-900/90 border border-slate-700/60 rounded-lg px-2 py-1 text-[8px] font-mono text-blue-400 flex items-center gap-1.5 backdrop-blur-sm shadow-2xl pointer-events-none">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Syncing...
        </div>
      )}
      {syncStatus === 'error' && (
        <div className="fixed top-2 right-2 z-[9999] bg-amber-950/90 border border-amber-800/60 rounded-lg px-2 py-1 text-[8px] font-mono text-amber-200 backdrop-blur-sm shadow-2xl pointer-events-none max-w-[260px]">
          Cloud sync offline — app uses local data. Unpause Supabase (QuantumAlphaDB) and set SUPABASE_SERVICE_KEY on Render.
        </div>
      )}
      {children}
    </>
  );
}
