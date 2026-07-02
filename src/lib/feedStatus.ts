import type { ConnectionStatus } from '@/lib/MarketDataContext';
import type { MarketPhase } from '@/lib/exchangeHours';

export interface FeedStatusDisplay {
  label: string;
  dotClass: string;
  badgeClass: string;
}

/** Shared LIVE / CLOSED / OFFLINE labels — matches exchange session, not just HTTP connected. */
export function getFeedStatusDisplay(
  connectionStatus: ConnectionStatus,
  pricesStreaming: boolean,
  phase?: MarketPhase,
): FeedStatusDisplay {
  if (connectionStatus === 'disconnected') {
    return {
      label: 'OFFLINE',
      dotClass: 'bg-red-500',
      badgeClass: 'text-red-400 bg-red-950/30 border-red-900/50',
    };
  }
  if (pricesStreaming) {
    const extended = phase === 'EXTENDED';
    return {
      label: extended ? 'PRE/POST LIVE' : 'LIVE',
      dotClass: extended ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500 animate-pulse',
      badgeClass: extended
        ? 'text-orange-400 bg-orange-950/30 border-orange-900/50'
        : 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50',
    };
  }
  return {
    label: 'CLOSED',
    dotClass: 'bg-amber-500',
    badgeClass: 'text-amber-400 bg-amber-950/30 border-amber-900/50',
  };
}
