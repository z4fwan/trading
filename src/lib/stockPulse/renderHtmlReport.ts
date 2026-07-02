import type { StockPulseReport } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(v: number | null | undefined, digits = 2, prefix = ''): string {
  if (v == null || !Number.isFinite(v)) return '⚠ verify';
  return `${prefix}${v.toFixed(digits)}`;
}

function pill(text: string, kind: 'good' | 'warn' | 'bad' | 'neutral'): string {
  const cls = { good: 'sp-pill-good', warn: 'sp-pill-warn', bad: 'sp-pill-bad', neutral: 'sp-pill-neutral' }[kind];
  return `<span class="sp-pill ${cls}">${esc(text)}</span>`;
}

function confBanner(report: StockPulseReport): string {
  const map = {
    HIGH: ['sp-conf-high', '✓ High confidence', 'Most sections have live sourced data'],
    MODERATE: ['sp-conf-mod', '◐ Moderate confidence', 'Some metrics need manual verification'],
    LOW: ['sp-conf-low', '⚠ Low confidence', 'Limited live data — verify on Screener.in'],
    VERY_LOW: ['sp-conf-vlow', '⛔ Very low confidence', 'Treat as outline only'],
  } as const;
  const [cls, title, sub] = map[report.dataConfidence];
  const screenerN = report.metricSources
    ? Object.values(report.metricSources).filter(s => s.includes('Screener')).length
    : 0;
  const srcNote = screenerN > 0 ? ` · ${screenerN} metrics from Screener.in (page/API)` : '';
  return `<div class="sp-conf ${cls}"><strong>${title}</strong> · ${report.sectionsLive}/14 sections live · ${report.crossCheck.verifiedCount} cross-checked${srcNote} · ${esc(sub)}</div>`;
}

function crossCheckTable(report: StockPulseReport): string {
  if (!report.crossCheck.metrics.length) return '';
  const rows = report.crossCheck.metrics
    .map(
      m => `<tr>
        <td>${esc(m.label)}</td>
        <td class="sp-status-${m.status.toLowerCase()}">${esc(m.status)}</td>
        <td>${esc(m.readings.map(r => `${r.source}: ${r.display}`).join(' · ') || '—')}</td>
        <td class="num">${m.adopted != null ? esc(String(m.adopted)) : '—'}</td>
      </tr>`,
    )
    .join('');
  return `<div class="sp-card"><h3>Automatic cross-check</h3>
    <p class="sp-muted">${esc(report.crossCheck.sourcesResponded.join(' · ') || 'Yahoo')} — ${report.crossCheck.verifiedCount} verified, ${report.crossCheck.mismatchCount} mismatches</p>
    <div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>Metric</th><th>Status</th><th>Sources</th><th>Used</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function navItems(): { id: string; icon: string; label: string }[] {
  return [
    { id: 'pulse', icon: '📡', label: 'Pulse' },
    { id: 'overview', icon: '🏢', label: 'Overview' },
    { id: 'business', icon: '💼', label: 'Business' },
    { id: 'valuation', icon: '💰', label: 'Valuation' },
    { id: 'growth', icon: '📈', label: 'Growth' },
    { id: 'health', icon: '🏥', label: 'Health' },
    { id: 'returns', icon: '💎', label: 'Returns' },
    { id: 'moat', icon: '🏰', label: 'Moat' },
    { id: 'peers', icon: '⚖️', label: 'Peers' },
    { id: 'owners', icon: '👥', label: 'Owners' },
  ];
}

function sectionPulse(r: StockPulseReport): string {
  const offset = 364 - (r.pulse.score / 10) * 364;
  const color = r.pulse.quality === 'STRONG' ? '#1A6645' : r.pulse.quality === 'MODERATE' ? '#B8840A' : '#C93030';
  const flags = r.flags
    .map(f => `<div class="sp-flag"><strong>⛔ ${esc(f.title)}</strong><p>${esc(f.note)}</p></div>`)
    .join('');
  const breakdown = r.pulse.breakdown
    .map(b => `<div class="sp-check ${b.pass ? 'pass' : 'fail'}">${b.pass ? '✓' : '○'} ${esc(b.label)}</div>`)
    .join('');
  return `<section id="sec-pulse" class="sp-section active">
    <div class="sp-pulse-ring">
      <svg width="160" height="160" style="transform:rotate(-90deg)">
        <circle cx="80" cy="80" r="66" fill="none" stroke="#DDD6CC" stroke-width="12"/>
        <circle cx="80" cy="80" r="66" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="414" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="sp-pulse-score"><span class="big">${r.pulse.score}</span><span class="small">/10</span></div>
    </div>
    <h2 class="sp-title-center" style="color:${color}">${esc(r.pulse.quality)} FUNDAMENTALS</h2>
    <p class="sp-lead">${esc(r.pulse.oneLiner)}</p>
    ${flags}
    <div class="sp-grid-2">
      <div class="sp-box-good"><h4>What works</h4>${r.pulse.strengths.map(s => `<div>✓ ${esc(s)}</div>`).join('') || '<div class="sp-muted">—</div>'}</div>
      <div class="sp-box-bad"><h4>Watch out</h4>${r.pulse.risks.map(s => `<div>! ${esc(s)}</div>`).join('') || '<div class="sp-muted">—</div>'}</div>
    </div>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.pulse || '')}</p></div>
    <h4 class="sp-sub">Pulse checklist (${r.pulse.breakdown.filter(b => b.pass).length}/10)</h4>
    <div class="sp-check-grid">${breakdown}</div>
    <p class="sp-muted"><strong>Track quarterly:</strong> ${esc(r.pulse.trackQuarterly)}</p>
  </section>`;
}

function sectionOverview(r: StockPulseReport): string {
  const p = r.price;
  return `<section id="sec-overview" class="sp-section">
    <h2 class="sp-h2">Overview</h2>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.overview || '')}</p></div>
    <table class="sp-table">
      <tr><td>Current price</td><td class="num">₹${fmt(p.cmp)}</td></tr>
      <tr><td>52-week high</td><td class="num">₹${fmt(p.high52)}</td></tr>
      <tr><td>52-week low</td><td class="num">₹${fmt(p.low52)}</td></tr>
      <tr><td>Market cap</td><td class="num">${p.marketCapCr != null ? `₹${Math.round(p.marketCapCr).toLocaleString('en-IN')} Cr` : '⚠'}</td></tr>
      <tr><td>Range position</td><td>${p.rangePosition ?? '—'}</td></tr>
      <tr><td>As of (IST)</td><td>${esc(p.asOf)}</td></tr>
      <tr><td>Horizon</td><td>${r.horizonYears} years</td></tr>
    </table>
  </section>`;
}

function sectionBusiness(r: StockPulseReport): string {
  return `<section id="sec-business" class="sp-section">
    <h2 class="sp-h2">What the company does</h2>
    <p>${esc(r.businessBlurb || r.simpleWords.business || '')}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.business || '')}</p></div>
    <p class="sp-muted">Sector: ${esc(r.sector)} · Industry: ${esc(r.industry)}</p>
  </section>`;
}

function sectionValuation(r: StockPulseReport): string {
  const rows = r.valuation.rows
    .map(
      row => `<tr>
        <td>${esc(row.label)}</td>
        <td class="num">${row.current != null ? row.current.toFixed(2) : '⚠'}</td>
        <td class="num">${row.sectorAvg != null ? row.sectorAvg.toFixed(1) : '—'}</td>
        <td>${row.signal ? pill(row.signal, row.signal === 'CHEAP' ? 'good' : row.signal === 'RICH' ? 'bad' : 'neutral') : '—'}</td>
        <td class="sp-muted" style="font-size:9px">${esc(row.source || '—')}</td>
      </tr>`,
    )
    .join('');
  return `<section id="sec-valuation" class="sp-section">
    <h2 class="sp-h2">Valuation — ${esc(r.valuation.verdict.replace(/_/g, ' '))}</h2>
    <p>${esc(r.valuation.summary)}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.valuation || '')}</p></div>
    <table class="sp-table"><thead><tr><th>Ratio</th><th>Now</th><th>Ref</th><th>Signal</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function sectionGrowth(r: StockPulseReport): string {
  const eps = (r.epsQuarters || [])
    .map(e => `<tr><td>${esc(e.quarter)}</td><td class="num">${e.eps != null ? e.eps.toFixed(1) : '⚠'}</td><td class="num">${e.yoyPct != null ? `${e.yoyPct.toFixed(0)}%` : '—'}</td></tr>`)
    .join('');
  return `<section id="sec-growth" class="sp-section">
    <h2 class="sp-h2">Growth — ${esc(r.growth.class.replace(/_/g, ' '))}</h2>
    <p>${esc(r.growth.summary)}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.growth || '')}</p></div>
    <ul class="sp-list">
      <li>Revenue CAGR 3Y: <span class="num">${fmt(r.growth.revenueCagr3y, 1)}%</span>${r.metricSources?.revenueGrowth ? ` <span class="sp-muted">(${esc(r.metricSources.revenueGrowth)})</span>` : ''}</li>
      <li>Revenue CAGR 5Y: <span class="num">${fmt(r.growth.revenueCagr5y, 1)}%</span></li>
      <li>Profit CAGR 3Y: <span class="num">${fmt(r.growth.profitCagr3y, 1)}%</span>${r.metricSources?.earningsGrowth ? ` <span class="sp-muted">(${esc(r.metricSources.earningsGrowth)})</span>` : ''}</li>
      <li>${esc(r.growth.marginNote)}</li>
    </ul>
    ${eps ? `<h4 class="sp-sub">Earnings trend (proxy)</h4><table class="sp-table"><thead><tr><th>Period</th><th>Profit (Cr)</th><th>Change</th></tr></thead><tbody>${eps}</tbody></table>` : ''}
  </section>`;
}

function sectionHealth(r: StockPulseReport): string {
  return `<section id="sec-health" class="sp-section">
    <h2 class="sp-h2">Financial health</h2>
    <p>${esc(r.health.summary)}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.health || '')}</p></div>
    <div class="sp-grid-2">
      <div class="sp-metric"><span>D/E</span><strong class="num">${fmt(r.health.debtEquity)}</strong>${pill(r.health.deSignal, r.health.deSignal.includes('SAFE') ? 'good' : r.health.deSignal.includes('HIGH') ? 'bad' : 'warn')}</div>
      <div class="sp-metric"><span>Current ratio</span><strong class="num">${fmt(r.health.currentRatio)}</strong>${pill(r.health.crSignal, 'neutral')}</div>
      <div class="sp-metric"><span>FCF</span><strong class="num">${r.health.fcfCr != null ? `₹${r.health.fcfCr.toFixed(0)} Cr` : '⚠'}</strong>${pill(r.health.fcfSignal, r.health.fcfSignal.includes('GROW') ? 'good' : 'warn')}</div>
      <div class="sp-metric"><span>Interest cover</span><strong class="num">${fmt(r.health.interestCoverage, 1)}</strong></div>
    </div>
  </section>`;
}

function sectionReturns(r: StockPulseReport): string {
  return `<section id="sec-returns" class="sp-section">
    <h2 class="sp-h2">Returns &amp; dividends</h2>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.returns || '')}</p></div>
    <div class="sp-grid-2">
      <div class="sp-metric"><span>ROE</span><strong class="num">${fmt(r.returns.roe, 1)}%</strong>${pill(r.returns.roeFlag, r.returns.roeFlag.includes('EXCELLENT') || r.returns.roeFlag.includes('GOOD') ? 'good' : 'warn')}</div>
      <div class="sp-metric"><span>ROCE</span><strong class="num">${fmt(r.returns.roce, 1)}%</strong></div>
      <div class="sp-metric"><span>Div yield</span><strong class="num">${fmt(r.returns.divYield, 2)}%</strong></div>
    </div>
    <p class="sp-muted">${esc(r.returns.dividendNote)}</p>
  </section>`;
}

function sectionMoat(r: StockPulseReport): string {
  const m = r.moat;
  const dims = [
    ['Brand', m.brand],
    ['Switching', m.switching],
    ['Network', m.network],
    ['Cost', m.cost],
    ['Regulatory', m.regulatory],
    ['IP', m.ip],
    ['Scale', m.scale],
  ];
  return `<section id="sec-moat" class="sp-section">
    <h2 class="sp-h2">Moat — ${esc(m.tier)} (${m.total}/14)</h2>
    <p>${esc(m.strength)}</p>
    <p class="sp-warn-text">Risk: ${esc(m.risk)}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.moat || '')}</p></div>
    <div class="sp-moat-bars">${dims.map(([l, v]) => {
      const score = Number(v);
      return `<div class="sp-moat-row"><span>${l}</span><div class="bar"><div style="width:${Math.min(100, (score / 2) * 100)}%"></div></div><span class="num">${score}/2</span></div>`;
    }).join('')}</div>
    <h4 class="sp-sub">Tailwinds</h4><ul class="sp-list">${r.tailwinds.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <h4 class="sp-sub">Headwinds</h4><ul class="sp-list">${r.headwinds.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  </section>`;
}

function sectionPeers(r: StockPulseReport): string {
  const rows = r.peers
    .map(
      p => `<tr class="${p.isSubject ? 'sp-subject' : ''}">
        <td><strong>${esc(p.ticker)}</strong>${p.isSubject ? ' ★' : ''}</td>
        <td class="num">${fmt(p.pe, 1)}</td>
        <td class="num">${fmt(p.pb, 1)}</td>
        <td class="num">${p.roe != null ? `${p.roe.toFixed(0)}%` : '⚠'}</td>
        <td>${esc(p.edge)}</td>
      </tr>`,
    )
    .join('');
  return `<section id="sec-peers" class="sp-section">
    <h2 class="sp-h2">Peers</h2>
    <p>${esc(r.peerStanding)}</p>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.peers || '')}</p></div>
    <table class="sp-table"><thead><tr><th>Ticker</th><th>P/E</th><th>P/B</th><th>ROE</th><th>Note</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Add peers on Screener.in compare tab</td></tr>'}</tbody></table>
  </section>`;
}

function sectionOwners(r: StockPulseReport): string {
  const o = r.ownership;
  const concall = o.concallPoints
    .map(c => `<div class="sp-concall"><strong>Said:</strong> ${esc(c.said)}<br/><strong>Means:</strong> ${esc(c.means)}</div>`)
    .join('');
  return `<section id="sec-owners" class="sp-section">
    <h2 class="sp-h2">Ownership &amp; trust</h2>
    <div class="sp-eli"><strong>🎒 In Simple Words</strong><p>${esc(r.simpleWords.owners || '')}</p></div>
    <div class="sp-grid-2">
      <div class="sp-metric"><span>Promoter</span><strong class="num">${o.promoterPct != null ? `${o.promoterPct.toFixed(1)}%` : '⚠'}</strong></div>
      <div class="sp-metric"><span>FII</span><strong class="num">${o.fiiPct != null ? `${o.fiiPct.toFixed(1)}%` : '⚠'}</strong></div>
      <div class="sp-metric"><span>Pledging</span><strong class="num">${o.pledgingPct != null ? `${o.pledgingPct.toFixed(1)}%` : '—'}</strong></div>
      <div class="sp-metric"><span>Trust</span><strong>${esc(o.trustLabel)}</strong> <span class="num">(${o.trustScore}/8)</span></div>
    </div>
    ${concall}
  </section>`;
}

function scenariosBlock(r: StockPulseReport): string {
  if (!r.scenarios.length) return '';
  const rows = r.scenarios
    .map(
      s => `<tr><td>${esc(s.label)}</td><td class="num">${s.revenueCr != null ? `${s.revenueCr.toFixed(0)} Cr` : '—'}</td>
        <td class="num">${s.profitCr != null ? `${s.profitCr.toFixed(0)} Cr` : '—'}</td><td class="num">${fmt(s.cagrUsed, 1)}% CAGR</td></tr>`,
    )
    .join('');
  return `<div class="sp-card sp-scenarios"><h3>What-if scenarios (${r.horizonYears}Y)</h3>
    <p class="sp-muted">Illustrative only — not predictions. Based on historical growth rates.</p>
    <table class="sp-table"><thead><tr><th>Case</th><th>Revenue</th><th>Profit</th><th>Assumption</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Lato:wght@400;700&display=swap');
:root {
  --bg-main: #020617; /* slate-950 */
  --bg-panel: rgba(15, 23, 42, 0.6); /* slate-900 with transparency */
  --border: rgba(255, 255, 255, 0.1);
  --text-main: #f1f5f9; /* slate-100 */
  --text-muted: #94a3b8; /* slate-400 */
  --accent-orange: #f97316;
  --accent-emerald: #10b981;
  --accent-red: #ef4444;
}
.sp-shell {
  font-family: Lato, sans-serif;
  font-size: 13px;
  color: var(--text-main);
  background: var(--bg-main);
  background-image: radial-gradient(circle at 15% 50%, rgba(249, 115, 22, 0.05), transparent 25%),
                    radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.05), transparent 25%);
  min-height: 100%;
}
.sp-shell * { box-sizing: border-box; }
.num { font-family: 'DM Mono', monospace; }
.sp-header {
  background: var(--bg-panel);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 24px 28px;
  position: relative;
  overflow: hidden;
}
.sp-header::after {
  content: ''; position: absolute; bottom: 0; left: 0; height: 1px; width: 100%;
  background: linear-gradient(90deg, transparent, var(--accent-orange), transparent);
  animation: scanline 4s linear infinite;
}
@keyframes scanline { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.sp-header h1 { font-family: 'DM Serif Display', serif; font-size: 28px; margin: 0; font-weight: 400; text-shadow: 0 0 10px rgba(255,255,255,0.1); }
.sp-header .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; font-size: 11px; }
.sp-header .ticker { color: var(--accent-orange); border: 1px solid rgba(249,115,22,0.4); padding: 2px 8px; border-radius: 4px; font-family: 'DM Mono', monospace; background: rgba(249,115,22,0.1); }
.sp-header .price { font-family: 'DM Mono', monospace; font-size: 32px; margin-top: 12px; font-weight: 500; text-shadow: 0 0 15px rgba(255,255,255,0.2); }
.sp-layout { display: flex; min-height: 480px; }
.sp-sidebar { width: 220px; background: rgba(2, 6, 23, 0.8); border-right: 1px solid var(--border); padding: 16px 0; flex-shrink: 0; }
.sp-sidebar button { display: block; width: 100%; text-align: left; padding: 12px 20px; border: none; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; border-left: 3px solid transparent; transition: all 0.2s ease; }
.sp-sidebar button:hover { color: var(--text-main); background: rgba(255,255,255,0.03); }
.sp-sidebar button.active { color: var(--text-main); background: linear-gradient(90deg, rgba(249,115,22,0.15) 0%, transparent 100%); border-left-color: var(--accent-orange); }
.sp-content { flex: 1; padding: 24px 28px; overflow: auto; max-height: 75vh; }
.sp-section { display: none; animation: fadeIn 0.4s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.sp-section.active { display: block; }
.sp-h2 { font-family: 'DM Serif Display', serif; font-size: 24px; margin: 0 0 16px; color: var(--text-main); }
.sp-eli { background: rgba(249, 115, 22, 0.05); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: 12px; padding: 16px; margin: 16px 0; color: #ffedd5; font-size: 12px; line-height: 1.6; backdrop-filter: blur(4px); }
.sp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 16px 0; }
.sp-table td, .sp-table th { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left; }
.sp-table th { background: rgba(255,255,255,0.03); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.sp-table-wrap { max-height: 250px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
.sp-pill { display: inline-block; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 99px; text-transform: uppercase; }
.sp-pill-good { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.sp-pill-warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
.sp-pill-bad { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.sp-pill-neutral { background: rgba(255, 255, 255, 0.1); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.2); }
.sp-conf { padding: 12px 20px; font-size: 11px; font-weight: 700; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.sp-conf-high { background: rgba(16, 185, 129, 0.05); color: #34d399; }
.sp-conf-mod { background: rgba(245, 158, 11, 0.05); color: #fbbf24; }
.sp-conf-low, .sp-conf-vlow { background: rgba(239, 68, 68, 0.05); color: #f87171; }
.sp-pulse-ring { position: relative; width: 180px; height: 180px; margin: 0 auto 24px; filter: drop-shadow(0 0 15px rgba(255,255,255,0.05)); }
.sp-pulse-score { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'DM Serif Display', serif; flex-direction: column; }
.sp-pulse-score .big { font-size: 52px; line-height: 1; text-shadow: 0 0 20px rgba(255,255,255,0.2); }
.sp-pulse-score .small { font-size: 14px; color: var(--text-muted); font-family: 'DM Mono', monospace; margin-top: 4px; }
.sp-title-center { text-align: center; font-family: 'DM Serif Display', serif; margin: 12px 0; letter-spacing: 1px; }
.sp-lead { text-align: center; color: var(--text-muted); max-width: 560px; margin: 0 auto 24px; line-height: 1.6; font-size: 14px; }
.sp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
.sp-box-good { background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px; padding: 16px; font-size: 11px; backdrop-filter: blur(4px); }
.sp-box-bad { background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 16px; font-size: 11px; backdrop-filter: blur(4px); }
.sp-box-good h4, .sp-box-bad h4 { font-size: 10px; text-transform: uppercase; margin: 0 0 12px; letter-spacing: 0.05em; color: var(--text-main); }
.sp-flag { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 12px 16px; margin: 12px 0; font-size: 12px; color: #fca5a5; }
.sp-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; }
.sp-check.pass { color: #34d399; } .sp-check.fail { color: var(--text-muted); opacity: 0.5; }
.sp-muted { color: var(--text-muted); font-size: 11px; }
.sp-metric { background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 16px; transition: transform 0.2s; }
.sp-metric:hover { transform: translateY(-2px); background: rgba(255,255,255,0.04); }
.sp-metric span { display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.sp-metric strong { display: block; font-size: 20px; margin: 6px 0; color: var(--text-main); }
.sp-moat-row { display: flex; align-items: center; gap: 12px; margin: 8px 0; font-size: 11px; }
.sp-moat-row .bar { flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
.sp-moat-row .bar div { height: 100%; background: linear-gradient(90deg, var(--accent-orange), #fbbf24); box-shadow: 0 0 10px rgba(249,115,22,0.5); }
.sp-sub { font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin: 20px 0 12px; letter-spacing: 0.05em; }
.sp-footer { padding: 20px 28px; border-top: 1px solid var(--border); font-size: 10px; color: var(--text-muted); line-height: 1.6; background: rgba(2, 6, 23, 0.9); backdrop-filter: blur(12px); }
.sp-footer a { color: var(--accent-orange); text-decoration: none; }
.sp-footer a:hover { text-decoration: underline; }
.sp-mobile-nav { display: none; }
.sp-subject { background: rgba(255,255,255,0.05); }
.sp-status-agree { color: #34d399; font-weight: 700; }
.sp-status-mismatch { color: #f87171; font-weight: 700; }
.sp-status-close { color: #fbbf24; font-weight: 700; }
@media(max-width:768px){
  .sp-layout{flex-direction:column}
  .sp-sidebar{display:none}
  .sp-mobile-nav{display:flex;position:sticky;bottom:0;background:var(--bg-panel);backdrop-filter:blur(12px);overflow-x:auto;padding:8px;border-top:1px solid var(--border);z-index:10;}
  .sp-mobile-nav button{flex:0 0 auto;padding:10px 14px;border:none;background:transparent;color:var(--text-muted);font-size:12px;border-radius:8px;}
  .sp-mobile-nav button.active{color:var(--text-main);background:rgba(249,115,22,0.15);}
}
`;

export function renderStockPulseHtml(report: StockPulseReport): string {
  const nav = navItems();
  const sidebar = nav
    .map(n => `<button type="button" data-sp-nav="${n.id}" class="${n.id === 'pulse' ? 'active' : ''}" onclick="goTo('${n.id}')">${n.icon} ${n.label}</button>`)
    .join('');
  const mobile = nav
    .map(n => `<button type="button" data-sp-mnav="${n.id}" onclick="goTo('${n.id}')">${n.icon}</button>`)
    .join('');

  const cmp = report.price.cmp;
  const sections = [
    sectionPulse(report),
    sectionOverview(report),
    sectionBusiness(report),
    sectionValuation(report),
    sectionGrowth(report),
    sectionHealth(report),
    sectionReturns(report),
    sectionMoat(report),
    sectionPeers(report),
    sectionOwners(report),
  ].join('');

  return `<style>${STYLES}</style>
<div class="sp-shell">
  <header class="sp-header">
    <h1>${esc(report.companyName)}</h1>
    <div class="meta">
      <span class="ticker">NSE: ${esc(report.ticker)}</span>
      <span style="opacity:.4">${esc(report.sector)}</span>
    </div>
    <div class="price">${cmp != null ? `₹${cmp.toFixed(2)}` : '—'}</div>
    <div class="meta" style="opacity:.35;margin-top:4px">${esc(report.price.asOf)} IST · ${report.horizonYears}Y horizon</div>
  </header>
  ${confBanner(report)}
  ${crossCheckTable(report)}
  ${scenariosBlock(report)}
  <div class="sp-layout">
    <nav class="sp-sidebar" aria-label="Report sections">${sidebar}</nav>
    <main class="sp-content">${sections}</main>
  </div>
  <nav class="sp-mobile-nav" aria-label="Mobile">${mobile}</nav>
  <footer class="sp-footer">
    ${esc(report.disclaimer)}
    Sources: ${report.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}
    · <a href="https://www.screener.in/company/${esc(report.ticker)}/" target="_blank" rel="noopener">Screener.in</a>
  </footer>
</div>
<script>
function goTo(id){
  document.querySelectorAll('.sp-section').forEach(function(el){ el.classList.remove('active'); });
  var sec=document.getElementById('sec-'+id);
  if(sec) sec.classList.add('active');
  document.querySelectorAll('[data-sp-nav]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-sp-nav')===id);
  });
  document.querySelectorAll('[data-sp-mnav]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-sp-mnav')===id);
  });
}
</script>`;
}
