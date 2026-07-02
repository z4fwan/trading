'use client';

import { useEffect, useRef, useCallback } from 'react';
import { calculateIndicators, buildCandleHistory, detectSmartMoney, type OHLC, type TAIndicators, type SmartMoneySignal } from './technicalAnalysis';

export interface WorkerResult {
  indicators: Record<string, TAIndicators>;
  smartMoney: Record<string, SmartMoneySignal>;
  errors: Record<string, string>;
}

function computeOnMainThread(
  tickers: string[],
  histories: Record<string, OHLC[]>,
  prices: Record<string, { price: number; volume: number; prevClose: number }>,
  sessionHighs: Record<string, { high: number; low: number }>,
): WorkerResult {
  const indicators: Record<string, TAIndicators> = {};
  const smartMoney: Record<string, SmartMoneySignal> = {};
  const errors: Record<string, string> = {};

  for (const ticker of tickers) {
    try {
      const hist = histories[ticker];
      const priceData = prices[ticker];
      const hl = sessionHighs[ticker];
      if (!hist || hist.length < 50 || !priceData || priceData.price <= 0) continue;
      const candles = buildCandleHistory(hist, priceData.price, priceData.volume, priceData.prevClose, hl?.high, hl?.low);
      if (candles.length < 50) continue;
      const ta = calculateIndicators(candles);
      if (ta) {
        indicators[ticker] = ta;
        smartMoney[ticker] = detectSmartMoney(candles, ta);
      }
    } catch (err) {
      errors[ticker] = err instanceof Error ? err.message : String(err);
    }
  }
  return { indicators, smartMoney, errors };
}

export function useAIWorker(
  onResult: (result: WorkerResult) => void,
  onError?: (error: string) => void,
): (tickers: string[], histories: Record<string, OHLC[]>, prices: Record<string, { price: number; volume: number; prevClose: number }>, sessionHighs: Record<string, { high: number; low: number }>) => void {
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../workers/aiEngine.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'INDICATORS_RESULT') {
          onResultRef.current(e.data);
        }
      };

      worker.onerror = (err) => {
        workerReadyRef.current = false;
        onErrorRef.current?.(err.message || 'Worker computation failed');
      };

      workerRef.current = worker;
      workerReadyRef.current = true;
    } catch {
      workerReadyRef.current = false;
    }

    return () => {
      worker?.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  const compute = useCallback(
    (
      tickers: string[],
      histories: Record<string, OHLC[]>,
      prices: Record<string, { price: number; volume: number; prevClose: number }>,
      sessionHighs: Record<string, { high: number; low: number }>,
    ) => {
      if (workerReadyRef.current && workerRef.current) {
        workerRef.current.postMessage({
          type: 'COMPUTE_INDICATORS',
          tickers,
          histories,
          prices,
          sessionHighs,
        });
        return;
      }
      try {
        const result = computeOnMainThread(tickers, histories, prices, sessionHighs);
        onResultRef.current(result);
      } catch (e) {
        onErrorRef.current?.(e instanceof Error ? e.message : 'Main-thread TA failed');
      }
    },
    [],
  );

  return compute;
}
