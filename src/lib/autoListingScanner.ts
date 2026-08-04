import { INDIAN_EQUITY_TICKERS } from './marketConfig';

// In-memory cache for new listings discovered during runtime
const newListings = new Set<string>();

/**
 * Simulates scanning public NSE API or RSS feeds for new IPOs / listings.
 * In production, this could scrape NSE India or use a news feed API.
 */
export async function runAutoListingScanner(): Promise<string[]> {
  // Real NSE IPO scanning not yet available
  return [];
}

/**
 * Returns the full active universe: statically configured NIFTY 500 + dynamically found listings.
 */
export function getDynamicIndianUniverse(): string[] {
  return [...INDIAN_EQUITY_TICKERS, ...Array.from(newListings)];
}
