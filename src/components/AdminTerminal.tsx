'use client';
import React, { useEffect, useState } from 'react';

export default function AdminTerminal() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/saas/admin/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setMetrics(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch metrics');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-emerald-500 font-mono animate-pulse">Loading Admin Terminal...</div>;
  if (error) return <div className="text-red-500 font-mono bg-red-900/20 p-4 rounded-xl border border-red-500/30">{error}</div>;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 transition-colors duration-300">
          <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-2">Total Users</div>
          <div className="text-4xl font-bold text-white font-mono">{metrics.totalUsers}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition-colors duration-300">
          <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-2">Active Subscribers</div>
          <div className="text-4xl font-bold text-blue-400 font-mono">{metrics.activeSubscribers}</div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/80">
          <h2 className="text-white font-mono font-bold tracking-wider">User Directory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/50 text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {metrics.users?.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-4 font-bold text-emerald-400">{u.displayName}</td>
                  <td className="px-4 py-4">{u.email}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] uppercase ${u.plan !== 'Free' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                      {u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {u.status === 'active' ? (
                      <span className="text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active</span>
                    ) : (
                      <span className="text-slate-500">{u.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-500">{new Date(u.joinedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {metrics.users?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
