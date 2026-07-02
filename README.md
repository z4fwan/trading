---
title: Trading AI
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---
# Quantum Alpha Terminal (Trading Dashboard)

Real-time market dashboard with Yahoo Finance quotes, SSE streaming, AI technical analysis, news feed, and optional Groq/OpenAI LLM explanations.

## Trading guide (PDF) — z4fwan™ Master Edition

Professional dark-themed guide with **site-accurate UI mockups**, daily profit plan, long-term strategy, pattern decoding, and AI evolution roadmap. **z4fwan™** on every page.

- **PDF (recommended):** [docs/Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.pdf](docs/Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.pdf)
- **HTML source:** [docs/Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.html](docs/Z4FWAN_QUANTUM_ALPHA_MASTER_GUIDE.html)
- **Regenerate PDF:** `npm install -D puppeteer && node scripts/generate-guide-pdf.mjs` (or Chrome → Print → Save as PDF with background graphics)

Legacy shorter guide: [docs/QUANTUM_ALPHA_TRADING_GUIDE.pdf](docs/QUANTUM_ALPHA_TRADING_GUIDE.pdf)

## Quick start (local)

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment** — copy `.env.example` to `.env.local` and set at minimum:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ADMIN_EMAIL` | Login email |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Login password |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Same values (server-side auth) |

Optional but recommended:

- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cloud sync
- `SUPABASE_SERVICE_KEY` — background ML persistence
- `LLM_API_KEY` — free Groq key for AI news/explanations ([console.groq.com](https://console.groq.com))

3. **Run the dev server** (only one instance)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, then open the dashboard.

4. **Verify realtime pipeline**

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/quotes
curl http://localhost:3000/api/news
```

Healthy engine shows `engine.running: true` and `lastQuoteAge` under a few seconds.

## Architecture

- **Background engine** (`src/lib/backgroundEngine.ts`) — started via `instrumentation.ts` on Node (skipped on Vercel). Fetches quotes every 1s locally (3s on Render), news every 3 minutes, ML in small batches so API routes stay responsive.
- **SSE** (`/api/stream`) — pushes cached quote JSON to the browser every 500ms–1s.
- **Client** (`MarketDataContext`) — polls `/api/quotes` + listens to SSE; loads OHLC history in priority batches.
- **AI** — client-side TA + ML; optional LLM via `/api/llm` when `LLM_API_KEY` is set.
- **Elite macro sources** (`src/lib/eliteOfficialFeeds.ts`) — free only: official RSS (Fed, UN, ECB, Pentagon) plus Google News per `@FederalReserve`-style handle. **No paid X/Twitter API**; third-party Twitter RSS (OpenRSS, xcancel, RSS.app) is not used because they require whitelist or paid plans.

## 24/7 autonomous AI (no browser required)

On **Render** (or any long-running Node host), the background engine runs continuously:

| Cycle | Interval | What it does |
|-------|----------|----------------|
| Quotes | 1s (3s on Render) | Yahoo live prices |
| News + LLM | 60s | RSS, elite official feeds, macro detection |
| Autonomous learning | 5 min | Resolve predictions, store experience, evolve weights |
| Full AI learning | 10 min | Adaptive weights + knowledge snapshots |
| Stock Pulse + gems | 12 min | Multibagger scan, fundamental memory, macro/news context (cached for dashboard) |

Experience accumulates in Supabase (`experience_history`, `strategy_performance`, `ai_knowledge_snapshots`) so accuracy improves over time without opening the dashboard.

Check status: `GET /api/health` and `GET /api/intelligence` → `autonomous24x7`.

**Required for persistence:** `SUPABASE_SERVICE_KEY` + run `supabase/migrations/001_experience_schema.sql` in Supabase SQL editor.

## Annual AI intelligence report (email + charts)

Even if you do not open the dashboard for months, the server can email a **deep HTML report** with bar/pie/trend SVG charts, system diagram, self-learning summary, undervalued gems, top/losing tickers, sudden movers, efficiency metrics, and a **future AI roadmap**.

| Report | When | Period |
|--------|------|--------|
| **Financial year** | Auto **1 April** (IST) if `ANNUAL_REPORT_FY_AUTO` is on | Indian FY Apr–Mar |
| **Monthly** | Last day of month if `ANNUAL_REPORT_MONTHLY=true` | Calendar month |
| **Demo** | On demand (last 7 days) | Testing |

**Default recipient:** `zn4.editz@gmail.com` (`ANNUAL_REPORT_EMAIL`).

### Setup (Render / local)

1. Set `ANNUAL_REPORT_EMAIL=zn4.editz@gmail.com`
2. Gmail: `GMAIL_USER` + `GMAIL_APP_PASSWORD` ([App Passwords](https://myaccount.google.com/apppasswords)), or use `RESEND_API_KEY`
3. Production: `ANNUAL_REPORT_SECRET` — required for `send=1` outside development
4. Keep `RENDER=true` so the daily scheduler runs with the 24/7 engine

### Preview and send demo today

```bash
# Browser preview (bar, pie, trend charts + roadmap)
http://localhost:3000/api/annual-report?action=preview&kind=demo

# Dry-run JSON (no email)
curl "http://localhost:3000/api/annual-report?action=demo&send=0"

# Send to Gmail (log in on site, or use secret header on Render)
curl -H "x-report-secret: YOUR_SECRET" \
  "https://YOUR-SITE.onrender.com/api/annual-report?action=demo&send=1"
```

Full financial-year send: `action=send&kind=financial_year&send=1`

## Production build

```bash
npm run build
npm start
```

On Render, set `RENDER=true` for 3s quote interval and enable the 24/7 engine.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Dashboard empty / frozen prices | Ensure only one `npm run dev` process; check `/api/health` |
| `/api/quotes` slow | Restart dev server; ML now runs in batches to avoid blocking |
| No AI text explanations | Add `LLM_API_KEY` (Groq free tier works) |
| Login fails | Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.local` |
