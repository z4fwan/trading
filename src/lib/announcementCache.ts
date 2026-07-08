'use client';

const SESSION_KEY = 'qa_announcements';
const LOCAL_KEY = 'qa_announcements_perm';
const MAX_ITEMS = 500;
const MAX_LOCAL_ITEMS = 200;

let memoryCache: any[] | null = null;

function getCache(): any[] {
  if (memoryCache) return memoryCache;
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      memoryCache = JSON.parse(saved);
      return memoryCache!;
    }
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(LOCAL_KEY);
    if (saved) {
      memoryCache = JSON.parse(saved);
      return memoryCache!;
    }
  } catch { /* ignore */ }
  memoryCache = [];
  return memoryCache;
}

function saveCache(items: any[]) {
  memoryCache = items;
  const sliced = items.slice(0, MAX_ITEMS);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sliced));
  } catch { /* storage full */ }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(sliced.slice(0, MAX_LOCAL_ITEMS)));
  } catch { /* storage full */ }
}

export function getCachedAnnouncements(): any[] {
  return getCache();
}

export function cacheAnnouncement(item: any) {
  const items = getCache();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else {
    items.unshift(item);
  }
  saveCache(items);
}

export function cacheAnnouncementBatch(items: any[]) {
  if (!items || items.length === 0) return;
  const existing = getCache();
  const ids = new Set(existing.map(i => i.id));
  for (const item of items) {
    if (!ids.has(item.id)) {
      existing.push(item);
      ids.add(item.id);
    }
  }
  existing.sort((a, b) => new Date(b.received_at || b.announcement_time).getTime() - new Date(a.received_at || a.announcement_time).getTime());
  saveCache(existing);
}

export function clearAnnouncementCache() {
  memoryCache = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
}
