'use client';

import { useEffect, useState } from 'react';

/** Isolated clock — updates every second without re-rendering the whole dashboard. */
export default function DashboardClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;
  return (
    <span className="text-[8px] text-slate-600 font-mono" suppressHydrationWarning>
      {time}
    </span>
  );
}
