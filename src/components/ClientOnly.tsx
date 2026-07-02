'use client';

import { useSyncExternalStore } from 'react';

/** Renders children only after mount — avoids SSR/client text mismatches (React #418). */
export default function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return fallback;
  return children;
}
