'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMarketData } from '@/lib/MarketDataContext';
import { isIndianTicker, INDIAN_EQUITY_TICKERS } from '@/lib/marketConfig';
import LiveTickerPrice from '@/components/LiveTickerPrice';
import { addPriceAlert, getPriceAlerts, removePriceAlert, type PriceAlert } from '@/lib/traderAlerts';

type TradeType = 'INTRADAY' | 'SWING' | 'OPTIONS';

interface TradeSetup {
  ticker: string;
  entry: number;
  stop: number;
  target: number;
  shares: number;
  capitalAllocated: number;
  riskAmount: number;
  potentialGain: number;
  rr: number;
  currency: string;
}

export default function TraderEdgePanel() {
  const { stocks } = useMarketData();
  
  // Settings
  const [capital, setCapital] = useState('100000');
  const [tradeType, setTradeType] = useState<TradeType>('INTRADAY');
  const [riskReward, setRiskReward] = useState('2'); // Target = 2x Risk
  const [numStocks, setNumStocks] = useState('1');
  
  // Stock Selections
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['RELIANCE']);
  
  // Custom Overrides
  const [customStops, setCustomStops] = useState<Record<string, string>>({});
  
  const [firedToast, setFiredToast] = useState<string>('');
  
  // Active Alerts
  const [activeAlerts, setActiveAlerts] = useState<PriceAlert[]>([]);
  
  const refreshAlerts = useCallback(() => {
    setActiveAlerts(getPriceAlerts());
  }, []);

  useEffect(() => {
    refreshAlerts();
    const interval = setInterval(refreshAlerts, 5000);
    return () => clearInterval(interval);
  }, [refreshAlerts]);

  // Handle number of stocks change
  useEffect(() => {
    const num = parseInt(numStocks) || 1;
    setSelectedTickers(prev => {
      const next = [...prev];
      while (next.length < num) next.push('RELIANCE');
      if (next.length > num) next.length = num;
      return next;
    });
  }, [numStocks]);

  // Derived setup
  const tradeSetups = useMemo(() => {
    const totalCapital = parseFloat(capital) || 0;
    const num = parseInt(numStocks) || 1;
    const allocPerStock = totalCapital / num;
    const rrRatio = parseFloat(riskReward) || 2;
    
    // Auto SL percentage based on Trade Type
    const slPct = tradeType === 'INTRADAY' ? 0.01 : tradeType === 'SWING' ? 0.04 : 0.15;
    
    const setups: TradeSetup[] = [];
    
    for (let i = 0; i < selectedTickers.length; i++) {
      const ticker = selectedTickers[i];
      const q = stocks[ticker];
      if (!q || q.price <= 0) continue;
      
      const entry = q.price;
      
      // Calculate Stop
      let stop = entry * (1 - slPct);
      if (customStops[ticker]) {
        stop = parseFloat(customStops[ticker]) || stop;
      }
      
      const riskPerShare = Math.abs(entry - stop);
      if (riskPerShare <= 0) continue;
      
      const target = entry + (riskPerShare * rrRatio);
      
      // Calculate Shares
      const shares = Math.floor(allocPerStock / entry);
      const capitalAllocated = shares * entry;
      const riskAmount = shares * riskPerShare;
      const potentialGain = shares * (target - entry);
      
      setups.push({
        ticker,
        entry,
        stop,
        target,
        shares,
        capitalAllocated,
        riskAmount,
        potentialGain,
        rr: rrRatio,
        currency: isIndianTicker(ticker) ? '₹' : '$',
      });
    }
    
    return setups;
  }, [capital, numStocks, selectedTickers, tradeType, riskReward, customStops, stocks]);

  const handleSubmit = useCallback(async () => {
    for (const setup of tradeSetups) {
      if (setup.shares <= 0) continue;
      // Add Target Alert
      addPriceAlert(setup.ticker, 'ABOVE', setup.target, tradeType, 'TARGET', setup.potentialGain);
      // Add Stop Loss Alert
      addPriceAlert(setup.ticker, 'BELOW', setup.stop, tradeType, 'STOP_LOSS', setup.riskAmount);
    }
    
    setFiredToast(`Successfully submitted ${tradeSetups.length} trade setups & activated Telegram alerts.`);
    
    const message = `[🤖 TRADE SETUP ACTIVATED]\nType: ${tradeType}\nTrades: ${tradeSetups.length}\nTotal Cap: ${capital}\n\n` + 
      tradeSetups.map(t => `${t.ticker} x${t.shares} | Entry: ${t.entry.toFixed(2)} | SL: ${t.stop.toFixed(2)} | TP: ${t.target.toFixed(2)}`).join('\n');
      
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
    } catch (e) {
      console.error(e);
    }
    
    refreshAlerts();
    setTimeout(() => setFiredToast(''), 5000);
  }, [tradeSetups, tradeType, capital, refreshAlerts]);

  const allOptions = useMemo(() => [...INDIAN_EQUITY_TICKERS], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-mono text-emerald-400">Trade Edge Terminal</h2>
        <div className="text-xs font-mono text-slate-500 uppercase">Advanced Position Sizing & Alerts</div>
      </div>
      
      {firedToast && (
        <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 p-4 rounded-lg font-mono text-sm shadow-lg shadow-emerald-500/10">
          {firedToast}
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="terminal-card p-4">
          <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Total Capital</label>
          <input 
            type="number" 
            value={capital}
            onChange={e => setCapital(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        
        <div className="terminal-card p-4">
          <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Trade Type</label>
          <select 
            value={tradeType}
            onChange={e => setTradeType(e.target.value as TradeType)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="INTRADAY">Intraday (1% SL)</option>
            <option value="SWING">Swing (4% SL)</option>
            <option value="OPTIONS">Options (15% SL)</option>
          </select>
        </div>

        <div className="terminal-card p-4">
          <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Risk:Reward Ratio</label>
          <select 
            value={riskReward}
            onChange={e => setRiskReward(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="1">1:1</option>
            <option value="1.5">1:1.5</option>
            <option value="2">1:2</option>
            <option value="3">1:3</option>
            <option value="5">1:5</option>
          </select>
        </div>

        <div className="terminal-card p-4">
          <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Number of Stocks</label>
          <select 
            value={numStocks}
            onChange={e => setNumStocks(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
          >
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Stocks</option>)}
          </select>
        </div>
      </div>

      {/* Stock Selection & Sizing Setup */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Position Sizing Engine</h3>
        
        {tradeSetups.length === 0 ? (
          <div className="text-center p-8 text-slate-500 font-mono text-sm border border-dashed border-slate-800 rounded-lg">
            Waiting for live market data to calculate sizes...
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {tradeSetups.map((setup, idx) => (
              <div key={idx} className="terminal-card p-5 border-l-2 border-l-emerald-500 flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-linear-to-l from-emerald-900/10 to-transparent pointer-events-none" />
                
                {/* Header: Select Ticker and Live Price */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10">
                  <div className="w-full sm:w-48">
                    <select
                      value={setup.ticker}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedTickers(prev => {
                          const next = [...prev];
                          next[idx] = val;
                          return next;
                        });
                        setCustomStops(prev => ({ ...prev, [val]: '' }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {allOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 font-mono uppercase">Live Entry</span>
                    <LiveTickerPrice ticker={setup.ticker} stocks={stocks} className="text-lg font-bold font-mono text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 z-10">
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase">Allocation</div>
                    <div className="text-sm font-bold font-mono text-slate-300">{setup.currency}{setup.capitalAllocated.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase">Shares</div>
                    <div className="text-sm font-bold font-mono text-emerald-400">{setup.shares}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase">Risk</div>
                    <div className="text-sm font-bold font-mono text-red-400">{setup.currency}{setup.riskAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase">Gain</div>
                    <div className="text-sm font-bold font-mono text-emerald-400">{setup.currency}{setup.potentialGain.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 z-10">
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase mb-1">Target Price (Auto)</div>
                    <div className="bg-emerald-950/30 border border-emerald-900/50 rounded p-2 text-emerald-400 font-bold font-mono text-sm">
                      {setup.currency}{setup.target.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 font-mono uppercase mb-1">Stop Loss (Override)</div>
                    <input 
                      type="number"
                      value={customStops[setup.ticker] !== undefined ? customStops[setup.ticker] : setup.stop.toFixed(2)}
                      onChange={e => setCustomStops(prev => ({ ...prev, [setup.ticker]: e.target.value }))}
                      className="w-full bg-red-950/20 border border-red-900/50 rounded p-2 text-red-400 font-bold font-mono text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-slate-800 mt-4">
        {tradeSetups.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 flex flex-col gap-4">
            {/* Row 1: Margin & Capital */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-800/50 pb-4">
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase mb-1">Allocated Margin (Stocks)</div>
                <div className="text-xl font-bold font-mono text-white">
                  ₹{tradeSetups.reduce((acc, s) => acc + s.capitalAllocated, 0).toLocaleString(undefined, {maximumFractionDigits: 0})}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase mb-1">Unused / Balance Capital</div>
                <div className="text-xl font-bold font-mono text-slate-300">
                  ₹{Math.max(0, (parseFloat(capital) || 0) - tradeSetups.reduce((acc, s) => acc + s.capitalAllocated, 0)).toLocaleString(undefined, {maximumFractionDigits: 0})}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-mono uppercase mb-1">Target Asset</div>
                <div className="text-sm font-bold font-mono text-slate-300 mt-1">
                  {tradeType}
                </div>
              </div>
            </div>

            {/* Row 2: Outcomes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded">
                <div className="text-[10px] text-emerald-500 font-mono uppercase mb-1">If All Targets Hit (Expected Profit)</div>
                <div className="flex items-end gap-3">
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    +₹{tradeSetups.reduce((acc, s) => acc + s.potentialGain, 0).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                  <div className="text-xs font-mono text-emerald-500/70 mb-1">
                    New Capital: ₹{((parseFloat(capital) || 0) + tradeSetups.reduce((acc, s) => acc + s.potentialGain, 0)).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                </div>
              </div>
              
              <div className="bg-red-950/20 border border-red-900/30 p-3 rounded">
                <div className="text-[10px] text-red-500 font-mono uppercase mb-1">If All Stop-Losses Hit (Max Risk)</div>
                <div className="flex items-end gap-3">
                  <div className="text-2xl font-bold font-mono text-red-400">
                    -₹{tradeSetups.reduce((acc, s) => acc + s.riskAmount, 0).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                  <div className="text-xs font-mono text-red-500/70 mb-1">
                    New Capital: ₹{((parseFloat(capital) || 0) - tradeSetups.reduce((acc, s) => acc + s.riskAmount, 0)).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold font-mono text-sm uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2"
          >
            <span>Submit Setup & Activate Telegram Bot</span>
          </button>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Active Alerts & Submissions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.map((alert, idx) => (
              <div key={`${alert.id}-${idx}`} className="bg-slate-900 border border-slate-800 rounded flex justify-between items-center p-3">
                <div className="flex flex-col">
                  <span className="text-xs font-mono text-slate-500 uppercase">{alert.tradeType || 'TRADE'} • {alert.type?.replace('_', ' ') || 'ALERT'}</span>
                  <span className="text-sm font-bold font-mono text-white">
                    {alert.ticker} {alert.direction} {alert.targetPrice}
                  </span>
                  {alert.expectedAmount && (
                    <span className={`text-xs font-bold font-mono mt-1 ${alert.type === 'TARGET' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {alert.type === 'TARGET' ? 'Profit' : 'Loss'}: ₹{alert.expectedAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    removePriceAlert(alert.id);
                    refreshAlerts();
                  }}
                  className="bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 px-3 py-1.5 rounded font-mono text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
