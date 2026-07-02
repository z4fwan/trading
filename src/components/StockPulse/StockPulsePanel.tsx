'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { StockPulseReport } from '@/lib/stockPulse/types';
import { recordStockPulseReport, summarizeLearning } from '@/lib/stockPulse/store';
import {
  searchSymbolSuggestions,
  searchHorizonSuggestions,
  parseHorizonYears,
  type SymbolSuggestion,
  type HorizonOption,
} from '@/lib/stockPulse/symbolSuggestions';
import PulseAutocomplete from '@/components/StockPulse/PulseAutocomplete';
import StockPulseReportView from '@/components/StockPulse/StockPulseReportView';

const WELCOME = `👋 Welcome to Stock Pulse.
I dig deep into Indian stocks so you don't have to guess. Just tell me two things:
Which stock? Company name or NSE/BSE ticker — e.g. Infosys · Zomato · HDFCBANK · Coal India
How long are you investing? 3 years · 5 years · 7 years · 10 years · or type your own
I'll search for fresh data and build your full report. 🚀`;

const RESEARCH_STEPS = [
  'Price & 52-week range',
  'Valuation ratios (P/E, P/B, EV/EBITDA)',
  'Revenue & profit growth',
  'Balance sheet & cash flow',
  'Returns (ROE, ROCE, dividends)',
  'Moat & competitive position',
  'Sector & peer comparison',
  'Promoter / FII shareholding',
  'Cross-checking Yahoo · NSE · Screener.in',
  'Building your Pulse score',
];

export default function StockPulsePanel() {
  const [step, setStep] = useState<'ask' | 'loading' | 'report'>('ask');
  const [tickerInput, setTickerInput] = useState('');
  const [horizonInput, setHorizonInput] = useState('');
  const [report, setReport] = useState<StockPulseReport | null>(null);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [serverLearnLine, setServerLearnLine] = useState<string | null>(null);

  const runAnalysis = useCallback(async (ticker: string, horizon: number) => {
    setStep('loading');
    setError('');
    setLoadingIdx(0);
    try {
      const res = await fetch('/api/stock-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, horizonYears: horizon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setReport(data.report);
      setHtml(data.html || '');
      recordStockPulseReport(data.report);
      setStep('report');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('ask');
    }
  }, []);

  const tickerSuggestions = useMemo(
    () => searchSymbolSuggestions(tickerInput),
    [tickerInput],
  );

  const horizonSuggestions = useMemo(
    () => searchHorizonSuggestions(horizonInput),
    [horizonInput],
  );

  const onSubmit = () => {
    const t = tickerInput.trim().toUpperCase().replace(/\.NS$|\.BO$/i, '');
    if (!t) return;
    void runAnalysis(t, parseHorizonYears(horizonInput));
  };

  useEffect(() => {
    fetch('/api/stock-pulse?action=status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.marketBrief) setServerLearnLine(d.marketBrief);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 'loading') return;
    const t = setInterval(() => {
      setLoadingIdx(i => (i + 1) % RESEARCH_STEPS.length);
    }, 1200);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== 'report' || !report) return;
    fetch(`/api/stock-pulse?action=summary&ticker=${encodeURIComponent(report.ticker)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.summary) setServerLearnLine(d.summary); })
      .catch(() => {});
  }, [step, report?.ticker]);

  const reset = () => {
    setStep('ask');
    setReport(null);
    setHtml('');
  };

  if (step === 'ask') {
    return (
      <div className="space-y-6 font-mono text-sm">
        <div className="relative rounded-2xl overflow-hidden border border-slate-700/50 shadow-[0_0_30px_rgba(249,115,22,0.1)] bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent pointer-events-none" />
          <pre className="relative z-10 whitespace-pre-wrap text-slate-300 text-[11px] leading-relaxed">
            {WELCOME}
          </pre>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pulse-stock-symbol" className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 block">Stock (NSE / BSE)</label>
            <PulseAutocomplete<SymbolSuggestion>
              inputId="pulse-stock-symbol"
              inputName="pulseStockSymbol"
              value={tickerInput}
              onChange={setTickerInput}
              onSelect={item => setTickerInput(item.ticker)}
              placeholder="e.g. RELIANCE, INFY, TCS"
              suggestions={tickerSuggestions}
              getKey={item => item.ticker}
              emptyHint="No match — try RELIANCE, HDFCBANK, TCS"
              renderItem={(item, active) => (
                <div className={`px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono ${active ? 'text-orange-200' : 'text-slate-300'}`}>
                  <div className="min-w-0">
                    <span className="font-bold text-white">{item.ticker}</span>
                    <span className="text-slate-500 ml-2 truncate">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-800/50">
                    {item.market}
                  </span>
                </div>
              )}
            />
          </div>
          <div>
            <label htmlFor="pulse-horizon" className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 block">Investment horizon</label>
            <PulseAutocomplete<HorizonOption>
              inputId="pulse-horizon"
              inputName="pulseHorizon"
              value={horizonInput}
              onChange={setHorizonInput}
              onSelect={item => setHorizonInput(item.label)}
              placeholder="e.g. 5 years"
              suggestions={horizonSuggestions}
              getKey={item => item.label}
              renderItem={(item, active) => (
                <div className={`px-3 py-2 text-[11px] font-mono ${active ? 'text-orange-200' : 'text-slate-300'}`}>
                  <span className="font-bold text-white">{item.label}</span>
                  <span className="text-slate-500 ml-2">({item.years}Y view)</span>
                </div>
              )}
            />
          </div>
        </div>
        <p className="text-[9px] text-slate-600">
          Indian equities first — Nifty 500 names. US tickers may have thinner cross-checks.
        </p>
        {serverLearnLine && (
          <p className="text-[9px] text-orange-400/80 font-mono border border-orange-900/30 rounded-lg px-3 py-2 bg-orange-950/20">
            🧠 {serverLearnLine}
          </p>
        )}
        {error && <p className="text-red-400 text-[10px]">{error}</p>}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!tickerInput.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-[11px] font-extrabold uppercase tracking-widest disabled:opacity-40 transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] hover:shadow-[0_0_25px_rgba(234,88,12,0.6)] transform hover:-translate-y-0.5"
        >
          Build Stock Pulse report
        </button>
        <p className="text-[9px] text-slate-600">
          No buy/sell advice. Live Yahoo + NSE + Screener cross-check — verify every number at{' '}
          <a href="https://www.screener.in" className="text-orange-400 underline" target="_blank" rel="noreferrer">Screener.in</a>.
        </p>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="py-16 px-4 text-center relative rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl shadow-[0_0_40px_rgba(16,185,129,0.1)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="text-5xl mb-6 animate-bounce">📡</div>
          <p className="text-emerald-400 font-mono text-[12px] uppercase tracking-widest font-bold mb-8 animate-pulse">Neural Engine Researching…</p>
        <ul className="max-w-md mx-auto text-left space-y-2">
          {RESEARCH_STEPS.map((label, i) => (
            <li
              key={label}
              className={`text-[11px] font-mono flex items-center gap-2 ${
                i <= loadingIdx ? 'text-orange-400' : 'text-slate-600'
              }`}
            >
              <span>{i < loadingIdx ? '✓' : i === loadingIdx ? '◉' : '○'}</span>
              {label}
            </li>
          ))}
        </ul>
        </div>
      </div>
    );
  }

  if (!html && !report) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-[10px] text-slate-500 font-mono">
        No report yet — enter a symbol and run Stock Pulse.
      </div>
    );
  }

  const learn = report ? summarizeLearning(report.ticker) : null;

  return (
    <div className="space-y-3">
      {(learn || serverLearnLine) && report && (
        <div className="text-[10px] text-orange-300/90 font-mono border border-orange-900/40 rounded-lg px-3 py-2 bg-orange-950/30">
          {serverLearnLine && <div>🖥️ {serverLearnLine}</div>}
          {learn && <div>🧠 {learn}</div>}
        </div>
      )}
      {html ? (
        <StockPulseReportView html={html} onNew={reset} />
      ) : (
        <p className="text-red-400 text-sm">Report HTML missing — try again.</p>
      )}
    </div>
  );
}
