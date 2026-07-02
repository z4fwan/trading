'use client';

import { useMemo } from 'react';
import type { OHLC } from '@/lib/technicalAnalysis';
import type { FullMarketIntelligence } from '@/lib/advancedMarketIntelligence';
import { computeFullIntelligence } from '@/lib/advancedMarketIntelligence';
import type { TAIndicators } from '@/lib/technicalAnalysis';

interface Props {
  ticker: string;
  candles: OHLC[];
  candlesByTF: Record<string, OHLC[]>;
  ta: TAIndicators | null;
  price: number;
  volumeRatio?: number;
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[6px] font-bold px-1 py-0.5 rounded ${color}`}>{label}</span>;
}

export default function AIMarketIntelligencePanel({ ticker, candles, candlesByTF, ta, price, volumeRatio }: Props) {
  const intelligence = useMemo((): FullMarketIntelligence | null => {
    if (!ta || candles.length < 20) return null;
    return computeFullIntelligence(
      ticker, candles, candlesByTF,
      ta.adx, ta.ema[20] || 0, ta.ema[50] || 0, ta.atr, price,
      ta.bollinger.width, volumeRatio ?? 1,
    );
  }, [ticker, candles, candlesByTF, ta, price, volumeRatio]);

  if (!intelligence) {
    return <div className="text-center py-8 text-slate-600 font-mono text-[9px]">Insufficient data for market intelligence</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">Market Intelligence</div>

      {/* Trend Strength */}
      <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold font-mono text-white">Trend Strength</span>
          <span className={`text-[9px] font-mono ${
            intelligence.trendStrength.label === 'VERY_STRONG' ? 'text-emerald-400' :
            intelligence.trendStrength.label === 'STRONG' ? 'text-blue-400' :
            intelligence.trendStrength.label === 'MODERATE' ? 'text-yellow-400' :
            'text-slate-500'
          }`}>{intelligence.trendStrength.label}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${
            intelligence.trendStrength.score >= 65 ? 'bg-emerald-500' :
            intelligence.trendStrength.score >= 45 ? 'bg-yellow-500' : 'bg-slate-600'
          }`} style={{ width: `${intelligence.trendStrength.score}%` }} />
        </div>
        <div className="flex justify-between text-[6px] text-slate-600 font-mono mt-1">
          <span>ADX: {ta?.adx.toFixed(0) ?? '—'}</span>
          <span>EMA: +{intelligence.trendStrength.emaContribution}</span>
          <span>Mom: +{intelligence.trendStrength.momentumContribution}</span>
          <span>Vol: +{intelligence.trendStrength.volumeContribution}</span>
        </div>
        <div className="text-[7px] text-slate-500 font-mono mt-2">{intelligence.trendStrength.description}</div>
      </div>

      {/* Candlestick Patterns */}
      {intelligence.patterns.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] font-bold font-mono text-white mb-2">Candlestick Patterns</div>
          <div className="space-y-1">
            {intelligence.patterns.map((p, i) => (
              <div key={i} className="bg-slate-950/30 rounded-lg p-2 border border-slate-800/30">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold font-mono text-white">{p.name}</span>
                  <Badge label={p.signal} color={p.signal === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' : p.signal === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'} />
                </div>
                <div className="text-[6px] text-slate-500 font-mono mt-1">{p.description}</div>
                {p.confirmationNeeded.length > 0 && (
                  <div className="text-[6px] text-yellow-600 font-mono mt-0.5">Need: {p.confirmationNeeded.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volatility & Liquidity */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-[7px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Volatility</div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold font-mono ${
              intelligence.volatility.regime === 'COMPRESSED' ? 'text-blue-400' :
              intelligence.volatility.regime === 'NORMAL' ? 'text-emerald-400' :
              intelligence.volatility.regime === 'EXTREME' ? 'text-red-400' : 'text-yellow-400'
            }`}>{intelligence.volatility.regime}</span>
          </div>
          <div className="text-[6px] text-slate-500 font-mono mt-1">{intelligence.volatility.description}</div>
          <div className="text-[6px] text-slate-600 font-mono mt-0.5">ATR: {intelligence.volatility.atrPercent}% | BB: {intelligence.volatility.bollingerWidth.toFixed(1)}</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-[7px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-1">Liquidity</div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold font-mono ${
              intelligence.liquidity.spreadRisk === 'LOW' ? 'text-emerald-400' :
              intelligence.liquidity.spreadRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400'
            }`}>{intelligence.liquidity.spreadRisk} RISK</span>
          </div>
          <div className="text-[6px] text-slate-500 font-mono mt-1">{intelligence.liquidity.reason}</div>
        </div>
      </div>

      {/* Fake Breakout */}
      {intelligence.fakeBreakout && intelligence.fakeBreakout.direction !== 'NEUTRAL' && (
        <div className={`bg-slate-950/40 border rounded-2xl p-3 ${intelligence.fakeBreakout.isFake ? 'border-red-800/40' : 'border-emerald-800/40'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-white">Breakout Analysis</span>
            <Badge label={intelligence.fakeBreakout.isFake ? '⚠ FAKE' : '✓ REAL'} color={intelligence.fakeBreakout.isFake ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'} />
          </div>
          <div className="text-[7px] text-slate-500 font-mono mt-1">{intelligence.fakeBreakout.reasons.join(' | ')}</div>
          <div className="text-[6px] text-slate-600 font-mono mt-0.5">Fake probability: {intelligence.fakeBreakout.probability}%</div>
        </div>
      )}

      {/* Momentum Exhaustion */}
      {intelligence.momentumExhaustion && intelligence.momentumExhaustion.exhaustionScore > 20 && (
        <div className="bg-slate-950/40 border border-yellow-800/40 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-white">Momentum Exhaustion</span>
            <span className={`text-[8px] font-mono ${intelligence.momentumExhaustion.isExhausted ? 'text-red-400' : 'text-yellow-400'}`}>
              {intelligence.momentumExhaustion.exhaustionScore}%
            </span>
          </div>
          <div className="text-[7px] text-slate-500 font-mono mt-1">{intelligence.momentumExhaustion.reason}</div>
        </div>
      )}

      {/* Manipulation Risk */}
      {intelligence.manipulation.score > 20 && (
        <div className="bg-slate-950/40 border border-red-800/40 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-white">Manipulation Risk</span>
            <span className="text-[8px] font-mono text-red-400">{intelligence.manipulation.probability}%</span>
          </div>
          <div className="text-[7px] text-slate-500 font-mono mt-1">{intelligence.manipulation.signals.join(' | ')}</div>
        </div>
      )}

      {/* Multi-timeframe Consensus */}
      {intelligence.timeframeConsensus && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] font-bold font-mono text-white mb-2">Timeframe Consensus</div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[9px] font-bold font-mono ${
              intelligence.timeframeConsensus.overallTrend === 'BULLISH' ? 'text-emerald-400' :
              intelligence.timeframeConsensus.overallTrend === 'BEARISH' ? 'text-red-400' : 'text-slate-400'
            }`}>{intelligence.timeframeConsensus.overallTrend}</span>
            <span className="text-[7px] text-slate-500 font-mono">
              {intelligence.timeframeConsensus.consensusStrength}% agreement
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {intelligence.timeframeConsensus.timeframes.map(tf => (
              <div key={tf.timeframe} className="bg-slate-950/30 rounded-lg p-1.5 flex justify-between items-center text-[7px] font-mono">
                <span className="text-slate-400">{tf.timeframe}</span>
                <span className={tf.trend === 'BULLISH' ? 'text-emerald-400' : tf.trend === 'BEARISH' ? 'text-red-400' : 'text-slate-500'}>
                  {tf.trend === 'BULLISH' ? '▲' : tf.trend === 'BEARISH' ? '▼' : '◆'} {tf.strength}
                </span>
              </div>
            ))}
          </div>
          {intelligence.timeframeConsensus.conflictingTimeframes.length > 0 && (
            <div className="text-[6px] text-yellow-600 font-mono mt-1">
              Conflict: {intelligence.timeframeConsensus.conflictingTimeframes.join(', ')}
            </div>
          )}
          <div className="text-[7px] text-slate-500 font-mono mt-1">{intelligence.timeframeConsensus.recommendation}</div>
        </div>
      )}

      {/* S/R Levels */}
      {intelligence.supportResistance.keyLevels.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
          <div className="text-[9px] font-bold font-mono text-white mb-2">Key Levels</div>
          <div className="grid grid-cols-2 gap-1">
            {intelligence.supportResistance.keyLevels.slice(0, 6).map((l, i) => (
              <div key={i} className="bg-slate-950/30 rounded-lg p-1.5 flex justify-between items-center text-[7px] font-mono">
                <span className="text-slate-400">${l.price.toFixed(2)}</span>
                <span className={l.type === 'SUPPORT' ? 'text-emerald-400' : 'text-red-400'}>
                  {l.type === 'SUPPORT' ? 'S' : 'R'}{l.strength}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
