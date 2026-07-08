'use client';
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'trading-announcements';
const DB_VERSION = 1;
const STORE_NAME = 'announcements';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('announcement_time', 'announcement_time');
          store.createIndex('received_at', 'received_at');
          store.createIndex('symbol', 'symbol');
          store.createIndex('category', 'category');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveAnnouncement(item: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, { ...item, _savedAt: Date.now() });
  } catch (e) {
    console.warn('[AnnouncementDB] save failed:', e);
  }
}

export async function saveAnnouncementBatch(items: any[]): Promise<number> {
  if (!items.length) return 0;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    let saved = 0;
    for (const item of items) {
      await tx.store.put({ ...item, _savedAt: Date.now() });
      saved++;
    }
    await tx.done;
    return saved;
  } catch (e) {
    console.warn('[AnnouncementDB] batch save failed:', e);
    return 0;
  }
}

export async function getAnnouncementsByDate(dateStr: string): Promise<any[]> {
  try {
    const db = await getDB();
    const start = new Date(dateStr + 'T00:00:00.000Z').toISOString();
    const end = new Date(dateStr + 'T23:59:59.999Z').toISOString();
    const items = await db.getAllFromIndex(STORE_NAME, 'announcement_time');
    return items
      .filter(i => i.announcement_time >= start && i.announcement_time <= end)
      .sort((a, b) => new Date(b.announcement_time).getTime() - new Date(a.announcement_time).getTime());
  } catch {
    return [];
  }
}

export async function getAnnouncementsByDateRange(startDate: string, endDate: string): Promise<any[]> {
  try {
    const db = await getDB();
    const start = new Date(startDate + 'T00:00:00.000Z').toISOString();
    const end = new Date(endDate + 'T23:59:59.999Z').toISOString();
    const items = await db.getAllFromIndex(STORE_NAME, 'announcement_time');
    return items
      .filter(i => i.announcement_time >= start && i.announcement_time <= end)
      .sort((a, b) => new Date(b.announcement_time).getTime() - new Date(a.announcement_time).getTime());
  } catch {
    return [];
  }
}

export async function getDailyCounts(year: number, month: number): Promise<Record<number, number>> {
  try {
    const db = await getDB();
    const items = await db.getAllFromIndex(STORE_NAME, 'announcement_time');
    const counts: Record<number, number> = {};
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    for (const item of items) {
      const t = item.announcement_time || item.received_at;
      if (!t) continue;
      const d = new Date(t);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = d.getUTCDate();
      if (`${y}-${m}` === prefix) {
        counts[day] = (counts[day] || 0) + 1;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

export async function getAllAnnouncements(limit = 500): Promise<any[]> {
  try {
    const db = await getDB();
    const items = await db.getAllFromIndex(STORE_NAME, 'received_at');
    return items.sort((a, b) => new Date(b.received_at || b.announcement_time).getTime() - new Date(a.received_at || a.announcement_time).getTime()).slice(0, limit);
  } catch {
    return [];
  }
}

export async function getTotalAnnouncementCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count(STORE_NAME);
  } catch {
    return 0;
  }
}

export async function clearAnnouncementDB(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch { /* ignore */ }
}
