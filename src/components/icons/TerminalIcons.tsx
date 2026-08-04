'use client';

import React from 'react';

export type IconName =
  | 'dashboard' | 'chart' | 'stocks' | 'predictions' | 'trust' | 'prices'
  | 'shield' | 'list' | 'calendar' | 'search' | 'wallet'
  | 'daily' | 'session' | 'news' | 'crystal' | 'track' | 'gem' | 'signal' | 'bolt' | 'brain' | 'pulse'
  | 'alert' | 'clock' | 'layers' | 'target' | 'book' | 'cpu' | 'activity' | 'globe' | 'india'
  | 'users' | 'key' | 'monitor' | 'refresh' | 'trash' | 'check' | 'x' | 'link' | 'offline' | 'online' | 'expired' | 'settings';

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  chart: <><path d="M3 17V7M8 17V3M13 17v-5M18 17v-9" strokeLinecap="round" /></>,
  stocks: <><path d="M4 19V9M9 19V5M14 19v-7M19 19V3" strokeLinecap="round" /><path d="M3 19h18" /></>,
  predictions: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2" strokeLinecap="round" /></>,
  trust: <><path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></>,
  prices: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 14h2M11 14h6" strokeLinecap="round" /></>,
  shield: <><path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16" strokeLinecap="round" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" strokeLinecap="round" /></>,
  wallet: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M16 12h2" strokeLinecap="round" /></>,
  daily: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16" strokeLinecap="round" /><path d="M8 15h4" strokeLinecap="round" /></>,
  session: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" /></>,
  news: <><path d="M6 5h12a2 2 0 012 2v12H6a2 2 0 01-2-2V7a2 2 0 012-2z" /><path d="M8 10h8M8 14h5" strokeLinecap="round" /></>,
  crystal: <><path d="M12 3l7 7-7 11L5 10l7-7z" strokeLinejoin="round" /><path d="M5 10h14" /></>,
  track: <><path d="M4 18V8M9 18V4M14 18v-6M19 18V10" strokeLinecap="round" /><path d="M3 18h18" /></>,
  gem: <><path d="M8 8l4-5 4 5 5 3-2 10H5L3 11l5-3z" strokeLinejoin="round" /></>,
  signal: <><circle cx="12" cy="12" r="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" strokeLinecap="round" /></>,
  bolt: <><path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" strokeLinejoin="round" /></>,
  brain: <><path d="M8 5a4 4 0 018 0c2 0 3 2 3 4a3 3 0 01-2 2.8V14a2 2 0 01-4 0v-2.2A3 3 0 018 9c0-2 1-4 0-4z" /><path d="M10 17a2 2 0 004 0" strokeLinecap="round" /></>,
  pulse: <><circle cx="12" cy="12" r="3" /><path d="M4 12h2M18 12h2M12 4v2M12 18v2" strokeLinecap="round" /><path d="M6 6l1.5 1.5M16.5 16.5L18 18M18 6l-1.5 1.5M7.5 16.5L6 18" strokeLinecap="round" /></>,
  alert: <><path d="M12 4l8 14H4L12 4z" strokeLinejoin="round" /><path d="M12 10v3M12 17h.01" strokeLinecap="round" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" strokeLinecap="round" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" strokeLinejoin="round" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  book: <><path d="M5 4h7a3 3 0 013 3v13H8a3 3 0 00-3-3V4z" /><path d="M19 4h-7a3 3 0 00-3 3v13h7a3 3 0 003-3V4z" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" strokeLinecap="round" /></>,
  activity: <><path d="M4 16l4-8 4 5 4-10 4 13" strokeLinecap="round" strokeLinejoin="round" /></>,
  globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4a12 12 0 010 16M12 4a12 12 0 000 16" /></>,
  india: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4v16" strokeLinecap="round" /></>,
  users: <><path d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1" strokeLinecap="round" /><circle cx="10" cy="8" r="4" /><path d="M23 20v-1a4 4 0 00-3-3.87M16 4.13a4 4 0 010 7.75" strokeLinecap="round" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" strokeLinecap="round" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" strokeLinecap="round" /></>,
  refresh: <><path d="M4 12a8 8 0 0114.3-5M20 12a8 8 0 01-5.7 7.7" strokeLinecap="round" /><path d="M4 4v4h4M20 20v-4h-4" strokeLinecap="round" strokeLinejoin="round" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 10v6M14 10v6" strokeLinecap="round" /></>,
  check: <><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></>,
  x: <><path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" /></>,
  link: <><path d="M10 14a5 5 0 007.07-2.76L18 10a5 5 0 00-7.07-7.07L9 5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 10a5 5 0 00-7.07 2.76L6 14a5 5 0 007.07 7.07L15 19" strokeLinecap="round" strokeLinejoin="round" /></>,
  offline: <><circle cx="12" cy="12" r="8" /><path d="M9 12l6 6M15 12l-6 6" strokeLinecap="round" /></>,
  online: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>,
  expired: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2 2M8 3l3 3M16 3l-3 3" strokeLinecap="round" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" strokeLinecap="round" /></>,
};

export function TerminalIcon({
  name,
  size = 16,
  className = 'text-emerald-400',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

/** Strict module order for AI Quant Engine */
export const AI_MODULE_TABS = [
  { key: 'DAILY' as const, label: 'Daily', icon: 'daily' as IconName },
  { key: 'SESSION' as const, label: 'Session', icon: 'session' as IconName },
  { key: 'NEWS' as const, label: 'News', icon: 'news' as IconName },
  { key: 'PREDICTIONS' as const, label: 'Predictions', icon: 'crystal' as IconName },
  { key: 'TRACK' as const, label: 'Track', icon: 'track' as IconName },
  { key: 'GEMS' as const, label: 'Gems', icon: 'gem' as IconName },
  { key: 'STOCK_PULSE' as const, label: 'Stock Pulse', icon: 'pulse' as IconName },
  { key: 'SIGNALS' as const, label: 'Signals', icon: 'signal' as IconName },
  { key: 'STRATEGIES' as const, label: 'Strategies', icon: 'bolt' as IconName },
  { key: 'LEARNING' as const, label: 'Learning', icon: 'brain' as IconName },
];

export type AIModuleKey = typeof AI_MODULE_TABS[number]['key'];
