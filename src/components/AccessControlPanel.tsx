'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { getGuestCodes, revokeGuestCode, generateGuestCode, isGuestCodeSystemAvailable, getAllGuestStats, recordGuestLogout } from '@/lib/sessionManager';
import { TerminalIcon } from '@/components/icons/TerminalIcons';
import APIKeyManager from './APIKeyManager';

interface GuestStat {
  label: string;
  code: string;
  firstSeen: number;
  lastSeen: number;
  online: boolean;
  totalHours: number;
  sessionCount: number;
}

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AccessControlPanel() {
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CODES'>('MONITOR');
  const [codes, setCodes] = useState(getGuestCodes());
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState(3600000);
  const [newCode, setNewCode] = useState('');
  const [guestErr, setGuestErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [guestStats, setGuestStats] = useState<GuestStat[]>([]);
  const guestCodesEnabled = isGuestCodeSystemAvailable();

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      setCodes(getGuestCodes());
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setGuestStats(getAllGuestStats());
    const t = setInterval(() => setGuestStats(getAllGuestStats()), 5000);
    return () => clearInterval(t);
  }, []);

  const refreshCodes = () => setCodes(getGuestCodes());

  const handleGenerate = () => {
    if (!label.trim()) return;
    setGuestErr('');
    try {
      const guest = generateGuestCode(label.trim(), duration);
      if (!guest) {
        setGuestErr('Guest codes need ADMIN_EMAIL on the server. Add it in Render env vars.');
        return;
      }
      setNewCode(guest.code);
      setLabel('');
      refreshCodes();
    } catch {
      setGuestErr('Could not generate a guest code. Try again.');
    }
  };

  const handleRevoke = (code: string) => {
    revokeGuestCode(code);
    recordGuestLogout(code);
    refreshCodes();
  };

  const activeCodes = codes.filter(c => !c.used && c.expiresAt > now);
  const expiredCodes = codes.filter(c => c.used || c.expiresAt <= now);

  const formatDuration = (ms: number) => {
    const diff = ms - now;
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  };

  const onlineCount = guestStats.filter(s => s.online).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white font-mono">Access Control</h2>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Guest session monitoring & code management</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[9px] font-mono px-2.5 py-1 rounded-full border ${onlineCount > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            {onlineCount} online
          </span>
          <span className="text-[9px] font-mono text-slate-600 px-2.5 py-1 rounded-full border border-slate-800">
            {activeCodes.length} codes active
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('MONITOR')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold font-mono rounded-lg transition-all ${activeTab === 'MONITOR' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}>
          <TerminalIcon name="monitor" size={12} /> User Monitor
        </button>
        <button onClick={() => setActiveTab('CODES')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold font-mono rounded-lg transition-all ${activeTab === 'CODES' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}>
          <TerminalIcon name="key" size={12} /> Code Management
        </button>
      </div>

      {activeTab === 'MONITOR' && (
        <div>
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="terminal-card p-3">
              <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">Total Users</div>
              <div className="text-xl font-bold font-mono text-white mt-1">{guestStats.length}</div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">Currently Online</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{onlineCount}</div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">Active Codes</div>
              <div className="text-xl font-bold font-mono text-blue-400 mt-1">{activeCodes.length}</div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">Total Hours</div>
              <div className="text-xl font-bold font-mono text-white mt-1">{guestStats.reduce((a, s) => a + s.totalHours, 0).toFixed(1)}h</div>
            </div>
          </div>

          {/* Users table */}
          <div className="terminal-card overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-[9px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">User</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">Status</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">First Seen</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">Last Online</th>
                    <th className="text-right px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">Sessions</th>
                    <th className="text-right px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">Hours Spent</th>
                    <th className="text-right px-3 py-2 text-slate-500 uppercase tracking-wider font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guestStats.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-600">No guest activity yet. Share an access code to get started.</td></tr>
                  )}
                  {guestStats.map(stat => (
                    <tr key={stat.code} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
                            {stat.label.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white font-bold">{stat.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {stat.online ? (
                          <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online</span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> Offline</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{formatDate(stat.firstSeen)}</td>
                      <td className="px-3 py-2.5 text-slate-400">{formatTime(stat.lastSeen)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{stat.sessionCount}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-white">{stat.totalHours.toFixed(1)}h</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => handleRevoke(stat.code)}
                          className="text-red-500/70 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-500/10 transition-all"
                          title="Revoke access">
                          <TerminalIcon name="trash" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'CODES' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Code generation */}
          <div className="terminal-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TerminalIcon name="key" size={14} className="text-emerald-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Generate New Code</span>
            </div>
            {!guestCodesEnabled && (
              <p className="text-[8px] font-mono text-amber-500/90">
                Set ADMIN_EMAIL (or NEXT_PUBLIC_ADMIN_EMAIL) on the host to enable guest codes.
              </p>
            )}
            {guestErr && <p className="text-[8px] font-mono text-red-400">{guestErr}</p>}
            <div>
              <label htmlFor="access-label" className="text-[7px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Guest Name</label>
              <input id="access-label" type="text" value={label} onChange={e => setLabel(e.target.value)}
                placeholder="e.g. John, Alice, Team Member"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[9px] font-mono text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-[7px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">Session Duration</label>
              <div className="flex gap-1">
                {[{ label: '1h', ms: 3600000 }, { label: '6h', ms: 21600000 }, { label: '24h', ms: 86400000 }, { label: '3d', ms: 259200000 }, { label: '7d', ms: 604800000 }].map(opt => (
                  <button key={opt.label} onClick={() => setDuration(opt.ms)}
                    className={`flex-1 py-1.5 text-[8px] font-bold font-mono rounded border transition-all ${duration === opt.ms ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleGenerate} disabled={!label.trim() || !guestCodesEnabled}
              className="w-full py-2 text-[9px] font-bold font-mono bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-all">
              + Generate Access Code
            </button>
            {newCode && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-lg text-center">
                <div className="text-[7px] font-mono text-emerald-500 uppercase tracking-wider">Share this code:</div>
                <div className="text-lg font-bold font-mono text-emerald-400 tracking-[0.3em] mt-1 select-all">{newCode}</div>
                <button onClick={() => { navigator.clipboard.writeText(newCode).then(() => setNewCode('')).catch(() => setGuestErr('Copy failed')); }}
                  className="text-[8px] font-mono text-slate-500 mt-1 hover:text-white transition-all">
                  <TerminalIcon name="check" size={10} className="inline mr-1" /> Copy & dismiss
                </button>
              </div>
            )}
          </div>

          {/* Active codes list */}
          <div className="space-y-3">
            {activeCodes.length > 0 && (
              <div className="terminal-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TerminalIcon name="online" size={12} className="text-emerald-400" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Active Codes ({activeCodes.length})</span>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                  {activeCodes.map(g => (
                    <div key={g.code} className="flex items-center justify-between bg-slate-950/40 rounded-lg px-3 py-2 border border-slate-800/50 hover:border-slate-700/50 transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
                          <span className="text-[8px] font-bold font-mono text-white truncate">{g.label}</span>
                        </div>
                        <div className="text-[7px] font-mono text-slate-600 mt-0.5">
                          <span className="text-blue-400/70 tracking-wider">{g.code}</span>
                          <span className="mx-1">·</span>
                          <span className="tabular-nums">{formatDuration(g.expiresAt)}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRevoke(g.code)}
                        className="text-[9px] text-red-500/70 hover:text-red-400 ml-1 shrink-0 px-1.5 py-1 rounded hover:bg-red-500/10 transition-all">
                        <TerminalIcon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expiredCodes.length > 0 && (
              <div className="terminal-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TerminalIcon name="expired" size={12} className="text-slate-500" />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Used / Expired ({expiredCodes.length})</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                  {expiredCodes.slice(-10).reverse().map(g => (
                    <div key={g.code} className="flex items-center justify-between bg-slate-950/20 rounded px-2 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[7px] font-mono text-slate-600">{g.label}</span>
                        <span className="text-[6px] font-mono text-slate-700">{g.code}</span>
                      </div>
                      <span className="text-[6px] font-mono text-slate-700 shrink-0">{g.used ? 'Used' : 'Expired'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Key Manager injected at the bottom of Access Control */}
      <div className="mt-8 border-t border-slate-800 pt-6">
        <APIKeyManager />
      </div>
    </div>
  );
}
