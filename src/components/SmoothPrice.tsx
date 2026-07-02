'use client';

type SmoothPriceProps = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/** Instant price display — no animation, no delay. */
export default function SmoothPrice({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  className = '',
}: SmoothPriceProps) {
  if (!Number.isFinite(value) || value <= 0) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
