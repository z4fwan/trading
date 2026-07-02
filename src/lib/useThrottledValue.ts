'use client';
import { useEffect, useRef, useState } from 'react';

/** Throttle fast-changing values (e.g. live quotes) so heavy UI work does not run every tick. */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastFlush = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
    const now = Date.now();
    const elapsed = now - lastFlush.current;

    const flush = () => {
      lastFlush.current = Date.now();
      setThrottled(latest.current);
      pending.current = null;
    };

    if (elapsed >= intervalMs) {
      flush();
      return;
    }

    if (!pending.current) {
      pending.current = setTimeout(flush, intervalMs - elapsed);
    }

    return () => {
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
      }
    };
  }, [value, intervalMs]);

  return throttled;
}
