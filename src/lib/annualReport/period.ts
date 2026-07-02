import { getIstDateParts } from '@/lib/adminAuthServer';

/** Indian financial year: 1 Apr – 31 Mar (IST) */
export function getIndianFinancialYear(date = new Date()): string {
  const { year, month } = getIstDateParts(date);
  if (month >= 4) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

export function getFinancialYearBounds(fy?: string, now = Date.now()): { start: number; end: number; label: string } {
  const d = new Date(now);
  let startYear: number;
  if (fy && /^\d{4}-\d{2}$/.test(fy)) {
    startYear = parseInt(fy.slice(0, 4), 10);
  } else {
    startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  }
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0).getTime();
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999).getTime();
  return {
    start,
    end: Math.min(end, now),
    label: `FY ${startYear}-${String(startYear + 1).slice(-2)} (Apr–Mar)`,
  };
}

export function getDemoPeriod(now = Date.now()): { start: number; end: number; label: string } {
  const start = now - 7 * 86400000;
  return {
    start,
    end: now,
    label: '7-day operational demo (today’s deep report)',
  };
}

export function getMonthlyPeriod(now = Date.now()): { start: number; end: number; label: string } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return {
    start,
    end: now,
    label: `Monthly digest — ${d.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`,
  };
}
