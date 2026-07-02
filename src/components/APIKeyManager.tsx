'use client';
import React, { useState, useEffect } from 'react';

interface SavedKey {
  key_name: string;
  updated_at: number;
}

export default function APIKeyManager() {
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('DEEPSEEK_API_KEY');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.keys) setKeys(data.keys);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleSave = async () => {
    if (!newKeyName || !newKeyValue) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name: newKeyName, key_value: newKeyValue }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Key saved successfully! Engine will update in ~60s.');
        setNewKeyValue('');
        fetchKeys();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-200">LLM Fallback API Keys</h3>
        <p className="text-[10px] text-slate-500 font-mono mt-1">
          Store backup API keys (DeepSeek, OpenAI) in the database. The background engine automatically switches to these if your primary Render environment variables hit rate limits.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
        {loading ? (
          <div className="text-xs text-slate-500 animate-pulse">Loading saved keys...</div>
        ) : keys.length === 0 ? (
          <div className="text-xs text-slate-500">No fallback keys configured.</div>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.key_name} className="flex justify-between items-center text-xs font-mono bg-black/40 px-2 py-1.5 rounded border border-slate-800">
                <span className="text-slate-300 font-bold">{k.key_name}</span>
                <span className="text-slate-500">Updated: {new Date(k.updated_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 mt-3 border-t border-slate-800 space-y-3">
          <div className="flex gap-2">
            <select
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="bg-black border border-slate-700 rounded px-2 py-1.5 text-xs text-white font-mono outline-none"
            >
              <option value="DEEPSEEK_API_KEY">DEEPSEEK_API_KEY</option>
              <option value="OPENAI_API_KEY">OPENAI_API_KEY</option>
              <option value="LLM_API_KEY">LLM_API_KEY (Groq)</option>
              <option value="GEMINI_API_KEY">GEMINI_API_KEY</option>
            </select>
            <input
              type="password"
              placeholder="sk-..."
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              className="flex-1 bg-black border border-slate-700 rounded px-2 py-1.5 text-xs text-white font-mono outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !newKeyValue}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold py-2 rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Securely Save Key'}
          </button>
          {msg && (
            <div className={`text-[10px] font-mono ${msg.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
