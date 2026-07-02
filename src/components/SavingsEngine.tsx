'use client';
import React, { useState, useMemo } from 'react';

export default function SavingsEngine() {
  const [capital, setCapital] = useState<number>(5000);
  const [risk, setRisk] = useState<'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE'>('BALANCED');
  const [months, setMonths] = useState<number>(24);
  const [monthlyAdd, setMonthlyAdd] = useState<number>(500);

  const rateMap = { CONSERVATIVE: 0.08, BALANCED: 0.14, AGGRESSIVE: 0.22 };
  const rate = rateMap[risk];

  const { finalValue, totalContributions, profit, monthlyBreakdown } = useMemo(() => {
    let value = capital;
    const monthlyRate = rate / 12;
    const breakdown: { month: number; value: number }[] = [{ month: 0, value: Math.round(value * 100) / 100 }];

    for (let m = 1; m <= months; m++) {
      value = value * (1 + monthlyRate) + monthlyAdd;
      if (m % 6 === 0 || m === months) breakdown.push({ month: m, value: Math.round(value * 100) / 100 });
    }

    const totalContribs = capital + monthlyAdd * months;
    return {
      finalValue: Math.round(value * 100) / 100,
      totalContributions: Math.round(totalContribs * 100) / 100,
      profit: Math.round((value - totalContribs) * 100) / 100,
      monthlyBreakdown: breakdown,
    };
  }, [capital, rate, months, monthlyAdd]);

  const dailyNudge = (capital / 30).toFixed(0);
  const missedCost = (capital * (1 + rate / 365) ** 14 - capital).toFixed(2);

  return (
    <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5 backdrop-blur-sm space-y-5 hover:border-slate-700/60 transition-all duration-500">
      <div>
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          💰 Smart Capital Engine
          <span className="text-[8px] font-mono text-emerald-500 bg-emerald-950/30 border border-emerald-900/40 px-1.5 py-0.5 rounded">v2.4</span>
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Autonomous compounding asset allocation with habit nudges</p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="savings-capital" className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Capital Amount (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
            <input id="savings-capital" name="capital" type="number" min={0} max={999999999} step={100} value={capital} onChange={e => setCapital(Math.min(999999999, Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-7 pr-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none font-mono" />
          </div>
        </div>

        <div>
          <label htmlFor="savings-monthly" className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Monthly SIP Addition</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
            <input id="savings-monthly" name="monthlyAdd" type="number" min={0} max={999999999} step={50} value={monthlyAdd} onChange={e => setMonthlyAdd(Math.min(999999999, Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-7 pr-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none font-mono" />
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Risk Vector</label>
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl">
            {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(v => (
              <button key={v} onClick={() => setRisk(v)} className={`py-2 text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all duration-200 ${
                risk === v
                  ? v === 'CONSERVATIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    v === 'BALANCED' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}>{v === 'CONSERVATIVE' ? 'Safe 8%' : v === 'BALANCED' ? 'Mod 14%' : 'Agg 22%'}</button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="savings-months" className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Holding Period: {months} months</label>
          <input id="savings-months" name="holdingMonths" type="range" min="6" max="120" step="6" value={months} onChange={e => setMonths(Number(e.target.value))} className="w-full accent-emerald-500" />
          <div className="flex justify-between text-[8px] text-slate-600 mt-0.5 font-mono"><span>6m</span><span>5y</span><span>10y</span></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-center">
          <div className="text-[7px] font-bold text-slate-500 uppercase tracking-wider font-mono">Invested</div>
          <div className="text-lg font-bold font-mono text-white">${totalContributions.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/40 text-center">
          <div className="text-[7px] font-bold text-slate-500 uppercase tracking-wider font-mono">Projected</div>
          <div className="text-lg font-bold font-mono text-emerald-400">${finalValue.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-blue-900/40 text-center">
          <div className="text-[7px] font-bold text-slate-500 uppercase tracking-wider font-mono">Profit</div>
          <div className="text-lg font-bold font-mono text-blue-400">${profit.toLocaleString()}</div>
        </div>
      </div>

      {/* Growth chart mini */}
      <div className="h-14 flex items-end gap-[2px] px-1">
        {monthlyBreakdown.map((pt, i) => {
          const maxVal = Math.max(...monthlyBreakdown.map(p => p.value), 1);
          const h = (pt.value / maxVal) * 48;
          return (
            <div key={i} className="flex-1 flex flex-col items-center relative group/bar">
              <div className="absolute bottom-full mb-1 hidden group-hover/bar:flex bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[8px] font-mono whitespace-nowrap z-10">
                ${pt.value.toLocaleString()}
              </div>
              <div className="w-full bg-gradient-to-t from-emerald-600/50 to-emerald-400 rounded-t-sm transition-all duration-300" style={{ height: `${Math.max(h, 2)}px` }} />
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-300 leading-relaxed">
        ⚠️ <b>AI Habit Nudge:</b> Delaying ${capital.toLocaleString()} deployment by 14 days eliminates ~${missedCost} in forecasted yield. Suggested auto-save: <b>$({dailyNudge})/day</b> or <b>$({Math.round(capital / 30 * 7)})/week</b> to build the habit. Consistency beats timing.
      </div>

      {profit > 0 && (
        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-emerald-300 leading-relaxed">
          ✅ <b>Wealth Milestone:</b> At this rate, your ${capital.toLocaleString()} grows to ${finalValue.toLocaleString()} in {months} months (${(profit / totalContributions * 100).toFixed(1)}% return). Increase monthly SIP by 10% yearly to supercharge compounding.
        </div>
      )}
    </div>
  );
}
