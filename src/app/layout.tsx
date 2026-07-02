import './globals.css';
import AppInit from '@/components/AppInit';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata = {
  title: {
    default: 'Quantum Alpha Terminal',
    template: '%s — Quantum Alpha Terminal',
  },
  description: 'Private Quantitative Intelligence Engine — Real-time market data, AI analytics, and prediction engine',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Quantum Alpha Terminal',
    description: 'Private Quantitative Intelligence Engine',
    siteName: 'Quantum Alpha Terminal',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-slate-950 text-slate-50">
      <body className="font-sans antialiased">
        <ErrorBoundary>
          <ToastProvider>
            <AppInit>{children}</AppInit>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
