'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { getMarketSession, getSessionTradingSignal } from '@/lib/marketSession';
import { getMarketSummary } from '@/lib/exchangeHours';
import { isIndianTicker } from '@/lib/marketConfig';
import LiveTickerPrice from '@/components/LiveTickerPrice';
import {
  addPriceAlert,
  getPriceAlerts,
  removePriceAlert,
  checkAlerts,
  type PriceAlert,
} from '@/lib/traderAlerts';

function calcPosition(
  capital: number,
  riskPct: number,
  entry: number,
  stop: number,
  target: number,
  isIndian: boolean,
) {
  const riskPerShare = Math.abs(entry - stop);
  if (riskPerShare <= 0 || capital <= 0 || entry <= 0) return null;
  const riskAmount = capital * (riskPct / 100);
  const shares = Math.floor(riskAmount / riskPerShare);
  if (shares <= 0) return null;
  const positionValue = shares * entry;
  const rewardPerShare = Math.abs(target - entry);
  const rr = rewardPerShare / riskPerShare;
  const maxLoss = shares * riskPerShare;
  const potentialGain = shares * rewardPerShare;
  const currency = isIndian ? '₹' : '$';
  return { shares, positionValue, riskAmount, maxLoss, potentialGain, rr, currency, riskPerShare };
}

export default function TraderEdgePanel() {
  const { stocks, indices, market } = useMarketData();
  const [capital, setCapital] = useState('100000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [calcTicker, setCalcTicker] = useState('RELIANCE');
  const [alertTicker, setAlertTicker] = useState('RELIANCE');
  const [alertPrice, setAlertPrice] = useState('');
  const [alertDir, setAlertDir] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [firedToast, setFiredToast] = useState<string[]>([]);

  const session = useMemo(() => getMarketSession(), []);
  const sessionSignal = useMemo(() => getSessionTradingSignal(session), [session]);
  const mkt = useMemo(() => getMarketSummary(), []);

  useEffect(() => {
    setAlerts(getPriceAlerts());
  }, []);

  useEffect(() => {
    const q = stocks[calcTicker];
    if (q?.price > 0 && !entry) {
      setEntry(String(q.price));
      const atrApprox = q.price * 0.02;
      setStop(String((q.price - atrApprox).toFixed(2)));
      setTarget(String((q.price + atrApprox * 2).toFixed(2)));
    }
  }, [calcTicker, stocks, entry]);

  useEffect(() => {
    const prices: Record<string, number> = {};
    for (const [t, s] of Object.entries(stocks)) {
      if (s.price > 0) prices[t] = s.price;
    }
    if (indices['^NSEI']?.price) prices['^NSEI'] = indices['^NSEI'].price;
    const { fired, remaining } = checkAlerts(prices);
    if (fired.length > 0) {
      setFiredToast(fired.map(a => `${a.ticker} ${a.direction === 'ABOVE' ? '≥' : '≤'} ${a.targetPrice}`));
      setAlerts(remaining);
      setTimeout(() => setFiredToast([]), 8000);
    }
  }, [stocks, indices]);

  const position = useMemo(() => {
    const e = parseFloat(entry);
    const s = parseFloat(stop);
    const t = parseFloat(target);
    const cap = parseFloat(capital);
    const r = parseFloat(riskPct);
    if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
    return calcPosition(cap, r, e, s, t, isIndianTicker(calcTicker));
  }, [capital, riskPct, entry, stop, target, calcTicker]);

  const useLivePrice = useCallback(() => {
    const q = stocks[calcTicker];
    if (!q?.price) return;
    setEntry(String(q.price));
    setStop(String((q.price * 0.98).toFixed(2)));
    setTarget(String((q.price * 1.04).toFixed(2)));
  }, [calcTicker, stocks]);

  const addAlert = () => {
    const p = parseFloat(alertPrice);
    if (!alertTicker || !Number.isFinite(p)) return;
    addPriceAlert(alertTicker, alertDir, p);
    setAlerts(getPriceAlerts());
    setAlertPrice('');
  };

  return (
    <div className="terminal-panel p-4 sm:p-5 space-y-4 h-full">
      <div>
        <h3 className="text-xs sm:text-sm font-bold text-emerald-400 font-mono uppercase tracking-wider">
          Trader Edge
        </h3>
        <p className="text-[9px] sm:text-[10px] text-slate-500 font-mono mt-1">Sizing · alerts · NSE session playbook</p>
      </div>

      {firedToast.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-600/40 rounded-lg px-3 py-2 text-[9px] font-mono text-amber-300">
          🔔 Alert hit: {firedToast.join(' · ')}
        </div>
      )}

      {/* Session playbook */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[9px] sm:text-[10px] font-mono">
        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2.5">
          <div className="text-slate-500 uppercase text-[7px]">NSE session</div>
          <div className="text-white font-bold mt-1">{mkt.nse.label}</div>
          <div className="text-slate-500 mt-0.5">{mkt.nse.localTime} IST</div>
        </div>
        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2.5">
          <div className="text-slate-500 uppercase text-[7px]">Phase</div>
          <div className="text-emerald-400 font-bold mt-1">{session.sessionLabel}</div>
          <div className="text-slate-500 mt-0.5">{session.minutesToClose}m to close</div>
        </div>
        <div className={`rounded-lg p-2.5 border ${
          sessionSignal.type === 'BUY' ? 'bg-emerald-950/30 border-emerald-800/40'
            : sessionSignal.type === 'SELL' ? 'bg-red-950/30 border-red-800/40'
            : 'bg-slate-950/50 border-slate-800'
        }`}>
          <div className="text-slate-500 uppercase text-[7px]">Playbook hint</div>
          <div className={`font-bold mt-1 ${
            sessionSignal.type === 'BUY' ? 'text-emerald-400' : sessionSignal.type === 'SELL' ? 'text-red-400' : 'text-yellow-400'
          }`}>{sessionSignal.type} · {sessionSignal.confidence}%</div>
          <div className="text-slate-500 mt-0.5 leading-snug">{sessionSignal.reason}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Position calculator */}
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Position size & risk/reward</div>
          <div className="flex gap-2 flex-wrap">
            <input
              id="trader-calc-ticker"
              name="calcTicker"
              type="text"
              value={calcTicker}
              onChange={e => setCalcTicker(e.target.value.toUpperCase())}
              placeholder="Ticker"
              className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono"
            />
            <button type="button" onClick={useLivePrice} className="text-[8px] text-emerald-400 font-mono border border-emerald-800/50 px-2 py-1 rounded hover:bg-emerald-950/30">
              Use live price
            </button>
            {stocks[calcTicker]?.price > 0 && (
              <LiveTickerPrice ticker={calcTicker} stocks={stocks} decimals={2} className="text-[10px] text-slate-300" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input id="trader-capital" name="capital" type="text" inputMode="decimal" value={capital} onChange={e => setCapital(e.target.value)} placeholder="Capital ₹" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono" />
            <input id="trader-risk-pct" name="riskPct" type="text" inputMode="decimal" value={riskPct} onChange={e => setRiskPct(e.target.value)} placeholder="Risk %" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono" />
            <input id="trader-entry" name="entry" type="text" inputMode="decimal" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Entry" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono" />
            <input id="trader-stop" name="stopLoss" type="text" inputMode="decimal" value={stop} onChange={e => setStop(e.target.value)} placeholder="Stop loss" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono" />
            <input id="trader-target" name="target" type="text" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white font-mono col-span-2" />
          </div>
          {position && (
            <div className="grid grid-cols-2 gap-2 text-[9px] font-mono mt-2">
              <div className="bg-slate-900 rounded p-2"><span className="text-slate-500">Shares</span><div className="text-white font-bold">{position.shares}</div></div>
              <div className="bg-slate-900 rounded p-2"><span className="text-slate-500">Position</span><div className="text-white font-bold">{position.currency}{Math.round(position.positionValue).toLocaleString()}</div></div>
              <div className="bg-red-950/20 rounded p-2"><span className="text-red-400">Max loss</span><div className="text-red-300 font-bold">{position.currency}{position.maxLoss.toFixed(0)}</div></div>
              <div className="bg-emerald-950/20 rounded p-2"><span className="text-emerald-400">If target hit</span><div className="text-emerald-300 font-bold">{position.currency}{position.potentialGain.toFixed(0)}</div></div>
              <div className="col-span-2 bg-slate-900 rounded p-2 text-center">
                <span className="text-slate-500">Risk : Reward </span>
                <span className={`font-bold ${position.rr >= 2 ? 'text-emerald-400' : position.rr >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                  1 : {position.rr.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Price alerts */}
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Price alerts (live feed)</div>
          <div className="flex flex-wrap gap-2">
            <input id="trader-alert-ticker" name="alertTicker" type="text" value={alertTicker} onChange={e => setAlertTicker(e.target.value.toUpperCase())} placeholder="Ticker" className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white" />
            <select id="trader-alert-direction" name="alertDirection" value={alertDir} onChange={e => setAlertDir(e.target.value as 'ABOVE' | 'BELOW')} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white">
              <option value="ABOVE">Crosses above</option>
              <option value="BELOW">Crosses below</option>
            </select>
            <input id="trader-alert-price" name="alertPrice" type="text" inputMode="decimal" value={alertPrice} onChange={e => setAlertPrice(e.target.value)} placeholder="Price" className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white" />
            <button type="button" onClick={addAlert} className="text-[8px] bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1 rounded font-bold">Add</button>
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
            {alerts.length === 0 ? (
              <p className="text-[8px] text-slate-600 font-mono">No alerts — set levels for breakouts or stop triggers.</p>
            ) : alerts.map(a => (
              <div key={a.id} className="flex justify-between items-center bg-slate-900/50 rounded px-2 py-1.5 text-[9px] font-mono">
                <span className="text-white">{a.ticker} {a.direction === 'ABOVE' ? '≥' : '≤'} {a.targetPrice}</span>
                <button type="button" onClick={() => { removePriceAlert(a.id); setAlerts(getPriceAlerts()); }} className="text-red-400 hover:text-red-300">×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
