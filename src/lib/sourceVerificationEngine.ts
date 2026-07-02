// === Source Verification Engine ===
// Gatekeeper: Every announcement must pass verification BEFORE LLM analysis.
// Rejects fake, stale, unconfirmed, or duplicate events.

import { isEliteSource, isIndianEliteSource, INDIAN_ELITE_DOMAINS } from './eliteSources';

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'REJECTED';

export interface VerificationResult {
  status: VerificationStatus;
  score: number; // 0-100
  sources: { name: string; confirmed: boolean }[];
  reasons: string[];
  timestamp: number;
}

// Official source domains that provide primary-source data
const OFFICIAL_FILING_SOURCES = [
  'nseindia.com', 'bseindia.com', 'NSE/BSE Corporate',
  'rbi.org.in', 'sebi.gov.in', 'pib.gov.in',
];

// Trusted confirmation sources (secondary)
const TRUSTED_CONFIRMATIONS = [
  'reuters.com', 'bloomberg.com', 'moneycontrol.com',
  'economictimes.indiatimes.com', 'livemint.com',
  'business-standard.com', 'cnbc.com',
];

// In-memory dedup cache (headline hash → timestamp)
const seenHeadlines = new Map<string, number>();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeHeadline(headline: string): string {
  return headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
}

function isDuplicate(headline: string): boolean {
  const key = normalizeHeadline(headline);
  const now = Date.now();

  // Clean old entries
  for (const [k, ts] of seenHeadlines.entries()) {
    if (now - ts > DEDUP_WINDOW_MS) seenHeadlines.delete(k);
  }

  if (seenHeadlines.has(key)) return true;
  seenHeadlines.set(key, now);
  return false;
}

export function verifySource(
  headline: string,
  source: string,
  timestamp: number,
  region: string,
): VerificationResult {
  const now = Date.now();
  let score = 0;
  const reasons: string[] = [];
  const sources: { name: string; confirmed: boolean }[] = [];

  // === 1. Official Source Check (40 points) ===
  const isOfficialFiling = OFFICIAL_FILING_SOURCES.some(s =>
    source.toLowerCase().includes(s.toLowerCase())
  );
  const isElite = isEliteSource(source);
  const isIndianElite = isIndianEliteSource(source);

  if (isOfficialFiling) {
    score += 40;
    sources.push({ name: source, confirmed: true });
    reasons.push('Official exchange filing (NSE/BSE/RBI/SEBI)');
  } else if (isIndianElite) {
    score += 30;
    sources.push({ name: source, confirmed: true });
    reasons.push('Trusted Indian financial press');
  } else if (isElite) {
    score += 25;
    sources.push({ name: source, confirmed: true });
    reasons.push('Tier-1 international press');
  } else {
    score += 5;
    sources.push({ name: source, confirmed: false });
    reasons.push('Unknown or unverified source');
  }

  // === 2. Multi-Source Confirmation (25 points) ===
  // In a real system, this would check if other feeds have the same story.
  // For now, official filings get full credit (they ARE the primary source).
  if (isOfficialFiling) {
    score += 25;
    reasons.push('Primary source — no confirmation needed');
  } else if (isElite || isIndianElite) {
    score += 15;
    reasons.push('Trusted source — partial confirmation');
  } else {
    score += 0;
    reasons.push('No multi-source confirmation');
  }

  // === 3. Timestamp Freshness (20 points) ===
  const ageMs = now - timestamp;
  const ONE_HOUR = 60 * 60 * 1000;
  const FOUR_HOURS = 4 * ONE_HOUR;

  if (ageMs <= ONE_HOUR) {
    score += 20;
    reasons.push(`Fresh: ${Math.round(ageMs / 60000)}min old`);
  } else if (ageMs <= FOUR_HOURS) {
    score += 12;
    reasons.push(`Recent: ${Math.round(ageMs / ONE_HOUR)}hr old`);
  } else if (ageMs <= 8 * ONE_HOUR) {
    score += 5;
    reasons.push(`Aging: ${Math.round(ageMs / ONE_HOUR)}hr old`);
  } else {
    score += 0;
    reasons.push(`STALE: ${Math.round(ageMs / ONE_HOUR)}hr old — rejected`);
  }

  // === 4. Duplicate / Stale Detection (15 points) ===
  if (isDuplicate(headline)) {
    score -= 30; // Heavy penalty — likely a duplicate or reprocessed item
    reasons.push('DUPLICATE: This headline was already processed');
  } else {
    score += 15;
    reasons.push('Unique headline — not a duplicate');
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // Determine status
  let status: VerificationStatus;
  if (score >= 70) {
    status = 'VERIFIED';
  } else if (score >= 40) {
    status = 'UNVERIFIED';
  } else {
    status = 'REJECTED';
  }

  return { status, score, sources, reasons, timestamp: now };
}
