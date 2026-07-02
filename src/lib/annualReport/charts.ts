/** Inline SVG charts for email-safe HTML reports */

export function barChart(
  title: string,
  items: { label: string; value: number; color?: string }[],
  width = 520,
  height = 200,
): string {
  const max = Math.max(...items.map(i => i.value), 1);
  const barH = 22;
  const gap = 8;
  const chartH = items.length * (barH + gap) + 40;
  const bars = items
    .map((item, i) => {
      const w = Math.max(4, (item.value / max) * (width - 160));
      const y = 36 + i * (barH + gap);
      const color = item.color || '#E8621A';
      return `
        <text x="8" y="${y + 14}" fill="#94a3b8" font-size="11" font-family="monospace">${escapeXml(item.label.slice(0, 18))}</text>
        <rect x="120" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${125 + w}" y="${y + 14}" fill="#f8fafc" font-size="11" font-weight="bold" font-family="monospace">${item.value}</text>
      `;
    })
    .join('');
  return `
    <svg width="${width}" height="${Math.max(height, chartH)}" viewBox="0 0 ${width} ${Math.max(height, chartH)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
      <text x="8" y="20" fill="#f8fafc" font-size="13" font-weight="bold">${escapeXml(title)}</text>
      ${bars}
    </svg>
  `;
}

export function pieChart(
  title: string,
  slices: { label: string; value: number; color: string }[],
  size = 200,
): string {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let angle = -90;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const paths: string[] = [];
  const legend: string[] = [];

  slices.forEach((sl, i) => {
    const pct = sl.value / total;
    const sweep = pct * 360;
    const a1 = (angle * Math.PI) / 180;
    angle += sweep;
    const a2 = (angle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const large = sweep > 180 ? 1 : 0;
    if (sl.value > 0) {
      paths.push(
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${sl.color}" stroke="#0f172a" stroke-width="1"/>`,
      );
    }
    legend.push(
      `<text x="${size + 12}" y="${24 + i * 18}" fill="#cbd5e1" font-size="10" font-family="monospace">■ ${escapeXml(sl.label)} ${(pct * 100).toFixed(0)}%</text>`,
    );
  });

  return `
    <svg width="${size + 140}" height="${Math.max(size, slices.length * 18 + 30)}" viewBox="0 0 ${size + 140} ${Math.max(size, slices.length * 18 + 30)}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="14" fill="#f8fafc" font-size="12" font-weight="bold">${escapeXml(title)}</text>
      <g transform="translate(0,16)">
        ${paths.join('')}
        ${legend.join('')}
      </g>
    </svg>
  `;
}

export function accuracyTrendBars(
  title: string,
  months: { label: string; accuracy: number }[],
): string {
  const w = 520;
  const h = 180;
  const max = 100;
  const step = months.length > 0 ? (w - 60) / months.length : 40;
  const bars = months
    .map((m, i) => {
      const bh = (m.accuracy / max) * 120;
      const x = 40 + i * step;
      const color = m.accuracy >= 55 ? '#22c55e' : m.accuracy >= 45 ? '#eab308' : '#ef4444';
      return `
        <rect x="${x}" y="${140 - bh}" width="${Math.max(step - 12, 16)}" height="${bh}" fill="${color}" rx="3"/>
        <text x="${x}" y="155" fill="#64748b" font-size="9" font-family="monospace">${escapeXml(m.label)}</text>
        <text x="${x}" y="${125 - bh}" fill="#e2e8f0" font-size="9" font-family="monospace">${m.accuracy.toFixed(0)}%</text>
      `;
    })
    .join('');
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <text x="8" y="18" fill="#f8fafc" font-size="12" font-weight="bold">${escapeXml(title)}</text>
      <line x1="36" y1="140" x2="${w - 8}" y2="140" stroke="#334155" stroke-width="1"/>
      ${bars}
    </svg>
  `;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
