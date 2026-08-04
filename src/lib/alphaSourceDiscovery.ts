import fs from 'fs';
import path from 'path';
import { getAllCachedQuotes } from './quoteFetcher';
import { googleNewsIndiaRss } from './indianMacro';
import { callLLM } from './llmProvider';
import { getTickerName } from './marketConfig';
import crypto from 'crypto';

const ALPHA_SOURCES_FILE = path.join(process.cwd(), 'data', 'alphaSources.json');

export interface AlphaSource {
  domain: string;
  reliabilityScore: number;
  predictionsCaught: number;
  lastCaughtTicker?: string;
  lastCaughtDate?: number;
}

export function getAlphaSources(): AlphaSource[] {
  try {
    if (!fs.existsSync(ALPHA_SOURCES_FILE)) return [];
    return JSON.parse(fs.readFileSync(ALPHA_SOURCES_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveAlphaSources(sources: AlphaSource[]) {
  try {
    if (!fs.existsSync(path.dirname(ALPHA_SOURCES_FILE))) {
      fs.mkdirSync(path.dirname(ALPHA_SOURCES_FILE), { recursive: true });
    }
    fs.writeFileSync(ALPHA_SOURCES_FILE, JSON.stringify(sources, null, 2));
  } catch (e) {
    console.error('Failed to save alpha sources', e);
  }
}

function parseRssXmlToItems(xml: string) {
  const items: { title: string; description: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = /<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i.exec(block) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const descMatch = /<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i.exec(block) || /<description[^>]*>([\s\S]*?)<\/description>/i.exec(block);
    const dateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block);
    if (titleMatch) {
      items.push({
        title: titleMatch[1].replace(/<[^>]*>?/gm, '').trim(),
        description: descMatch ? descMatch[1].replace(/<[^>]*>?/gm, '').trim() : '',
        pubDate: dateMatch ? dateMatch[1].trim() : '',
      });
    }
  }
  return items;
}

export async function runAlphaDiscoveryCycle() {
  console.log('[AlphaDiscovery] Starting retrospective discovery cycle...');
  const alphaSources = getAlphaSources();
  let discoveredCount = 0;
  
  const quotes = getAllCachedQuotes();
  
  // Find top gainers and losers of the day
  const massiveMovers = Object.values(quotes).filter(q => 
    q.changePercent !== null && Math.abs(q.changePercent) > 5.0 && q.volume && q.volume > 100000
  ).sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));

  console.log(`[AlphaDiscovery] Found ${massiveMovers.length} massive movers today.`);

  for (const mover of massiveMovers.slice(0, 5)) {
    const cleanName = mover.name.split(' ')[0].replace(/[^a-zA-Z]/g, '');
    if (cleanName.length < 3) continue;
    
    const direction = (mover.changePercent || 0) > 0 ? 'surge OR jump OR rally OR buy' : 'crash OR fall OR plunge OR sell';
    
    // We want news from yesterday or 2 days ago
    const query = `"${cleanName}" (${direction}) when:3d`;
    const rssUrl = googleNewsIndiaRss(query);

    try {
      const res = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const xml = await res.text();
      const items = parseRssXmlToItems(xml);
      
      for (const item of items.slice(0, 5)) {
        const parts = item.title.split(' - ');
        const publisher = parts.length > 1 ? parts[parts.length - 1].trim() : null;
        
        if (publisher && publisher !== 'Google News') {
          // Verify with LLM if this was a PREDICTIVE article
          const prompt = `Analyze this news article published recently about ${cleanName}:\nTitle: ${item.title}\nDescription: ${item.description}\nDid this article PREDICT the movement of the stock BEFORE it happened, or is it just reporting on the movement AFTER the fact? Answer only with PREDICTION or REPORTING.`;
          
          const analysis = await callLLM('You are a helpful analyst.', prompt, 200, 0, 'groq');
          if (analysis.content && analysis.content.includes('PREDICTION')) {
            console.log(`[AlphaDiscovery] ALHPA SOURCE DETECTED! ${publisher} successfully predicted ${cleanName}.`);
            
            let sourceDomain = publisher.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
            if (publisher.includes('Moneycontrol')) sourceDomain = 'moneycontrol.com';
            if (publisher.includes('Mint')) sourceDomain = 'livemint.com';
            if (publisher.includes('Economic Times')) sourceDomain = 'economictimes.indiatimes.com';
            if (publisher.includes('CNBC')) sourceDomain = 'cnbctv18.com';
            if (publisher.includes('Business Standard')) sourceDomain = 'business-standard.com';
            if (publisher.includes('Financial Express')) sourceDomain = 'financialexpress.com';

            const existing = alphaSources.find(s => s.domain === sourceDomain);
            if (existing) {
              existing.predictionsCaught += 1;
              existing.reliabilityScore = Math.min(99, existing.reliabilityScore + 5);
              existing.lastCaughtTicker = mover.name;
              existing.lastCaughtDate = Date.now();
            } else {
              alphaSources.push({
                domain: sourceDomain,
                reliabilityScore: 80,
                predictionsCaught: 1,
                lastCaughtTicker: mover.name,
                lastCaughtDate: Date.now()
              });
            }
            discoveredCount++;
          }
        }
      }
    } catch (e) {
      console.error(`[AlphaDiscovery] Error hunting for ${mover.name}:`, e);
    }
    
    // Wait between searches to avoid Google blocks
    await new Promise(r => setTimeout(r, 2000));
  }

  if (discoveredCount > 0) {
    saveAlphaSources(alphaSources);
    console.log(`[AlphaDiscovery] Saved ${discoveredCount} new alpha sources.`);
  }
}
