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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) return null;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-900/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              ACCESS CONTROL
              <span className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${onlineCount > 0 ? 'bg-emerald-400' : 'bg-blue-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${onlineCount > 0 ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest mt-1 uppercase">Guest Session Monitoring & Auth</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-lg border flex flex-col items-end ${onlineCount > 0 ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-slate-950/80 border-slate-800'}`}>
              <div className="text-[9px] text-slate-500 font-mono uppercase">Online Users</div>
              <div className={`text-sm font-bold font-mono ${onlineCount > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{onlineCount}</div>
            </div>
            <div className="px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col items-end">
              <div className="text-[9px] text-slate-500 font-mono uppercase">Active Codes</div>
              <div className="text-sm font-bold text-blue-400 font-mono">{activeCodes.length}</div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60 w-fit">
          <button onClick={() => setActiveTab('MONITOR')}
            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold font-mono uppercase tracking-wider rounded-lg transition-all ${activeTab === 'MONITOR' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-slate-500 hover:text-white border border-transparent hover:bg-slate-800/50'}`}>
            <TerminalIcon name="monitor" size={14} /> User Monitor
          </button>
          <button onClick={() => setActiveTab('CODES')}
            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold font-mono uppercase tracking-wider rounded-lg transition-all ${activeTab === 'CODES' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-slate-500 hover:text-white border border-transparent hover:bg-slate-800/50'}`}>
            <TerminalIcon name="key" size={14} /> Code Management
          </button>
        </div>

        {activeTab === 'MONITOR' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex flex-col items-center group hover:border-slate-700 transition-colors">
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Total Users</div>
                <div className="text-2xl font-black font-mono text-white mt-1 group-hover:scale-110 transition-transform">{guestStats.length}</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex flex-col items-center group hover:border-slate-700 transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-emerald-900/10" />
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 relative z-10">Currently Online</div>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1 relative z-10 group-hover:scale-110 transition-transform">{onlineCount}</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex flex-col items-center group hover:border-slate-700 transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-900/10" />
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 relative z-10">Active Codes</div>
                <div className="text-2xl font-black font-mono text-blue-400 mt-1 relative z-10 group-hover:scale-110 transition-transform">{activeCodes.length}</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex flex-col items-center group hover:border-slate-700 transition-colors">
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Total Hours</div>
                <div className="text-2xl font-black font-mono text-amber-400 mt-1 group-hover:scale-110 transition-transform">{guestStats.reduce((a, s) => a + s.totalHours, 0).toFixed(1)}h</div>
              </div>
            </div>

            {/* Users table */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-[10px] font-mono">
                  <thead className="bg-slate-900/80 border-b border-slate-800/80 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-bold">User</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 font-bold">First Seen</th>
                      <th className="px-4 py-3 font-bold">Last Online</th>
                      <th className="px-4 py-3 font-bold text-right">Sessions</th>
                      <th className="px-4 py-3 font-bold text-right">Hours</th>
                      <th className="px-4 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {guestStats.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-slate-500 text-sm">No guest activity yet. Share an access code to get started.</td></tr>
                    )}
                    {guestStats.map(stat => (
                      <tr key={stat.code} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shrink-0">
                              {stat.label.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-white font-bold text-[11px]">{stat.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {stat.online ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Offline
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatDate(stat.firstSeen)}</td>
                        <td className="px-4 py-3 text-slate-400">{formatTime(stat.lastSeen)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-300">{stat.sessionCount}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-400">{stat.totalHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleRevoke(stat.code)}
                            className="text-red-400 hover:text-white bg-red-950/30 hover:bg-red-500 p-1.5 rounded border border-red-900/50 hover:border-red-400 transition-all shadow-sm"
                            title="Revoke access">
                            <TerminalIcon name="trash" size={14} />
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Code generation */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col space-y-4">
              <div className="flex items-center gap-2 mb-2 pb-3 border-b border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <TerminalIcon name="key" size={16} />
                </div>
                <div>
                  <h3 className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">Generate Code</h3>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">Create temporary access link</p>
                </div>
              </div>
              
              {!guestCodesEnabled && (
                <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 text-[10px] font-mono text-amber-400">
                  ⚠️ Set ADMIN_EMAIL (or NEXT_PUBLIC_ADMIN_EMAIL) on the host to enable guest codes.
                </div>
              )}
              {guestErr && <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-[10px] font-mono text-red-400">{guestErr}</div>}
              
              <div className="space-y-4 flex-1">
                <div>
                  <label htmlFor="access-label" className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-widest block mb-1.5">Guest Name / Identifier</label>
                  <input id="access-label" type="text" value={label} onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Investor, Client A"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-[11px] font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-widest block mb-2">Access Duration</label>
                  <div className="flex gap-2">
                    {[{ label: '1H', ms: 3600000 }, { label: '6H', ms: 21600000 }, { label: '24H', ms: 86400000 }, { label: '3D', ms: 259200000 }, { label: '7D', ms: 604800000 }].map(opt => (
                      <button key={opt.label} onClick={() => setDuration(opt.ms)}
                        className={`flex-1 py-2 text-[10px] font-bold font-mono rounded-lg border transition-all ${duration === opt.ms ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="pt-2">
                <button onClick={handleGenerate} disabled={!label.trim() || !guestCodesEnabled}
                  className="w-full py-3 text-[11px] font-black font-mono tracking-wider bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg transition-all shadow-lg shadow-blue-500/20">
                  GENERATE SECURE LINK
                </button>
              </div>

              {newCode && (
                <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl mt-4 animate-in zoom-in duration-300">
                  <div className="text-[9px] font-bold font-mono text-emerald-500 uppercase tracking-widest text-center mb-2">Share this code with the guest:</div>
                  <div className="bg-slate-950 rounded-lg p-3 text-center border border-emerald-900/30">
                    <div className="text-xl font-black font-mono text-emerald-400 tracking-[0.2em] select-all">{newCode}</div>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(newCode).then(() => setNewCode('')).catch(() => setGuestErr('Copy failed')); }}
                    className="w-full mt-3 py-2 text-[10px] font-bold font-mono text-emerald-400 hover:text-white bg-emerald-900/30 hover:bg-emerald-600 rounded-lg transition-colors border border-emerald-800/50">
                    <TerminalIcon name="check" size={12} className="inline mr-1.5" /> COPY TO CLIPBOARD
                  </button>
                </div>
              )}
            </div>

            {/* Active codes list */}
            <div className="space-y-4">
              {activeCodes.length > 0 && (
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 shadow-xl">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <TerminalIcon name="online" size={16} />
                    </div>
                    <div>
                      <h3 className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">Active Tokens</h3>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5">{activeCodes.length} codes currently valid</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                    {activeCodes.map(g => (
                      <div key={g.code} className="flex items-center justify-between bg-slate-900/60 rounded-xl p-3 border border-slate-800 hover:border-slate-700 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)] shrink-0" />
                            <span className="text-[11px] font-bold font-mono text-white truncate">{g.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 pl-4">
                            <span className="text-blue-400 font-bold tracking-wider">{g.code}</span>
                            <span>•</span>
                            <span className="text-amber-400/80 font-bold tabular-nums">Expires in {formatDuration(g.expiresAt)}</span>
                          </div>
                        </div>
                        <button onClick={() => handleRevoke(g.code)}
                          className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white bg-slate-800 hover:bg-red-500 rounded-lg border border-slate-700 hover:border-red-400 transition-all opacity-50 group-hover:opacity-100 shadow-sm ml-2 shrink-0">
                          <TerminalIcon name="trash" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {expiredCodes.length > 0 && (
                <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TerminalIcon name="expired" size={14} className="text-slate-500" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Archive History</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                    {expiredCodes.slice(-10).reverse().map(g => (
                      <div key={g.code} className="flex items-center justify-between bg-slate-900/30 rounded-lg px-3 py-2 border border-slate-800/30">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-bold font-mono text-slate-400">{g.label}</span>
                          <span className="text-[7px] font-mono text-slate-600">{g.code}</span>
                        </div>
                        <span className="text-[8px] font-mono font-bold px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-500 shrink-0">{g.used ? 'Redeemed' : 'Expired'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Key Manager injected at the bottom of Access Control */}
        <div className="mt-8 border-t border-slate-800/80 pt-8 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          <APIKeyManager />
        </div>
      </div>
    </div>
  );
}
