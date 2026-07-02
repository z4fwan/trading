export function getFutureRoadmap(): { title: string; items: string[] }[] {
  return [
    {
      title: 'Q2–Q3 — Learning & accuracy',
      items: [
        'Deeper pattern memory across Nifty 500 (sector rotation, earnings seasons)',
        'Auto-calibration when prediction confidence diverges from outcomes',
        'Cross-market linkage: US macro → Nifty open gap models',
      ],
    },
    {
      title: 'Stock Pulse & gems',
      items: [
        'Full FY history of every studied ticker in email reports',
        'Tenbagger watchlist with red-flag filters (pledging, governance)',
        'Peer comparison tables in PDF reports',
      ],
    },
    {
      title: 'Reporting & delivery',
      items: [
        'Financial year PDF attachment (Apr 1 auto-send)',
        'Monthly digest email option',
        'WhatsApp / Telegram alert hooks for macro shocks (optional)',
      ],
    },
    {
      title: 'Efficiency & scale',
      items: [
        'Smarter batching on Render free tier to stay under memory limits',
        'Optional GPU worker for faster ML batches',
        'Multi-user portfolios with separate learning tracks',
      ],
    },
  ];
}
