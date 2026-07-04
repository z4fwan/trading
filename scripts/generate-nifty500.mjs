/**
 * Regenerate src/lib/nifty500Tickers.json from NSE Nifty 500 CSV.
 * Usage: node scripts/generate-nifty500.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'nifty500.csv');
const outPath = path.join(__dirname, '../src/lib/nifty500Tickers.json');

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split(/\r?\n/).slice(1);
const syms = [];
for (const line of lines) {
  const parts = line.split(',');
  if (parts.length < 3) continue;
  const sym = parts[2].trim();
  const series = (parts[3] || '').trim();
  if (series !== 'EQ') continue;
  if (/ETF|BEES|IETF$/i.test(sym)) continue;
  if (/^[A-Z0-9&.-]+$/.test(sym)) syms.push(sym);
}
const uniq = [...new Set(syms)].sort();
fs.writeFileSync(outPath, JSON.stringify(uniq, null, 0));
console.log(`Wrote ${uniq.length} symbols to ${outPath}`);
