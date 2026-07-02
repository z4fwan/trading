import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://ff.kis.v2.scr.kaspersky-labs.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://ff.kis.v2.scr.kaspersky-labs.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://trading-dashboard-backend.onrender.com wss://trading-dashboard-backend.onrender.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://query1.yahoofinance.com https://fycxqkgnwqunujlwkmfr.supabase.co ws: wss: https://ff.kis.v2.scr.kaspersky-labs.com",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join('; ');

const nextConfig: NextConfig = {
  serverExternalPackages: ['yahoo-finance2'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
