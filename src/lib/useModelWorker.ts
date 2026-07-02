'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { OHLC } from './technicalAnalysis';
import type { MLModel } from './mlEngine';

export interface ModelWorkerResult {
  ticker: string;
  model: (Omit<MLModel, 'trainedAt'> & { trainedAt: number }) | null;
  error?: string;
}

export function useModelWorker(
  onResult: (result: ModelWorkerResult) => void,
  onError?: (error: string) => void,
): { train: (ticker: string, candles: OHLC[], forwardDays?: number) => void; supported: boolean } {
  const workerRef = useRef<Worker | null>(null);
  const [supported, setSupported] = useState(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let worker: Worker | null = null;
    let mounted = true;
    try {
      worker = new Worker(
        new URL('../workers/aiEngine.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'TRAIN_RESULT') {
          onResultRef.current(e.data);
        }
      };

      worker.onerror = (err) => {
        onErrorRef.current?.(err.message || 'Worker model training failed');
      };

      workerRef.current = worker;
      if (mounted) setTimeout(() => setSupported(true), 0);
    } catch {
      // Worker creation not supported — fallback to main-thread training
    }

    return () => {
      mounted = false;
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const train = useCallback(
    (ticker: string, candles: OHLC[], forwardDays?: number) => {
      workerRef.current?.postMessage({
        type: 'TRAIN_MODEL',
        ticker,
        candles,
        forwardDays,
      });
    },
    [],
  );

  return { train, supported };
}
