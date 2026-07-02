import { INDIAN_EQUITY_TICKERS } from './marketConfig';

// In-memory cache for new listings discovered during runtime
const newListings = new Set<string>();

/**
 * Simulates scanning public NSE API or RSS feeds for new IPOs / listings.
 * In production, this could scrape NSE India or use a news feed API.
 */
export async function runAutoListingScanner(): Promise<string[]> {
  console.log('[AutoListing] Running Auto-Listing Scanner for new IPOs...');
  
  // Here we would normally make a fetch request to an NSE API endpoint or parse a CSV
  // For demonstration, let's simulate finding a new ticker occasionally
  const mockScannedTickers = ['BAJAJHOUSING', 'AADHARHFC']; // Example recent IPOs
  
  const newlyAdded: string[] = [];
  for (const t of mockScannedTickers) {
    if (!INDIAN_EQUITY_TICKERS.includes(t) && !newListings.has(t)) {
      newListings.add(t);
      newlyAdded.push(t);
    }
  }

  if (newlyAdded.length > 0) {
    console.log(`[AutoListing] Scanner discovered ${newlyAdded.length} new tickers: ${newlyAdded.join(', ')}`);
  } else {
    console.log('[AutoListing] Scanner found no new listings.');
  }

  return newlyAdded;
}

/**
 * Returns the full active universe: statically configured NIFTY 500 + dynamically found listings.
 */
export function getDynamicIndianUniverse(): string[] {
  return [...INDIAN_EQUITY_TICKERS, ...Array.from(newListings)];
}
