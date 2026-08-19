const fs = typeof window === 'undefined' ? eval("require('fs')") : null;
const path = typeof window === 'undefined' ? eval("require('path')") : null;
import { INDIAN_EQUITY_TICKERS } from './marketConfig';

const DATA_FILE = path ? path.join(process.cwd(), 'data', 'dynamic_tickers.json') : '';

// In-memory cache
let dynamicTickersCache = new Set<string>();
let isInitialized = false;

/**
 * Loads dynamic tickers from disk (only once).
 */
function loadDynamicTickers() {
  if (isInitialized) return;
  if (!fs) {
    isInitialized = true;
    return;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        dynamicTickersCache = new Set(parsed);
      }
    } else {
      // Create if doesn't exist
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([]));
    }
  } catch (error) {
    console.error('[DynamicUniverse] Error loading tickers:', error);
  }
  isInitialized = true;
}

/**
 * Returns the full active universe: statically configured NIFTY 500 + dynamically found listings.
 */
export function getDynamicIndianUniverse(): string[] {
  loadDynamicTickers();
  return [...INDIAN_EQUITY_TICKERS, ...Array.from(dynamicTickersCache)];
}

/**
 * Returns only the newly discovered dynamic tickers.
 */
export function getDynamicTickersOnly(): string[] {
  loadDynamicTickers();
  return Array.from(dynamicTickersCache);
}

export function getFullUniverse(): string[] {
  loadDynamicTickers();
  return Array.from(new Set([...INDIAN_EQUITY_TICKERS, ...Array.from(dynamicTickersCache)]));
}

/**
 * Adds a new ticker to the dynamic universe and persists it to disk.
 * Skips if it already exists in the hardcoded list or dynamic list.
 */
export function addDynamicTicker(ticker: string): boolean {
  loadDynamicTickers();
  
  // Clean the ticker
  const cleanTicker = ticker.toUpperCase().trim();
  if (!cleanTicker) return false;

  // Ignore indices or malformed strings
  if (cleanTicker.includes('^') || cleanTicker.includes('=') || cleanTicker.length < 2) return false;

  // Check if it already exists in any hardcoded universe
  if (INDIAN_EQUITY_TICKERS.includes(cleanTicker)
    || dynamicTickersCache.has(cleanTicker)) {
    return false;
  }

  console.log(`[DynamicUniverse] 🌟 New Stock Discovered & Added: ${cleanTicker}`);
  
  dynamicTickersCache.add(cleanTicker);

  // Persist to disk
  if (fs && path) {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(dynamicTickersCache), null, 2));
    } catch (error) {
      console.error('[DynamicUniverse] Error saving ticker:', error);
    }
  }

  return true;
}
