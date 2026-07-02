import ChartShell from './ChartShell';

export const metadata = {
  title: 'Chart — Quantum Alpha Terminal',
  description: 'Advanced trading chart with real-time data, AI-driven technical analysis',
  robots: 'noindex, nofollow',
};

export default function ChartLayout({ children }: { children: React.ReactNode }) {
  return <ChartShell>{children}</ChartShell>;
}
