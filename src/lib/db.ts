// IndexedDB storage for heavy arrays — async, large capacity (>50MB)
// Lightweight state (settings, current predictions, indicator weights) stays in localStorage

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'trading-dashboard-db';
const DB_VERSION = 1;
const STORE_NAME = 'heavy_store';

let dbPromise: Promise<IDBPDatabase> | null = null;

export interface HeavyRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function heavyGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, key);
    return (record?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function heavySet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, { key, value, updatedAt: Date.now() } as HeavyRecord);
  } catch {
    // IndexedDB failure — non-critical, data will re-hydrate on next fetch
  }
}

export async function heavyRemove(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, key);
  } catch { /* ignore */ }
}

export async function heavyClear(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch { /* ignore */ }
}

export async function heavyKeys(): Promise<string[]> {
  try {
    const db = await getDB();
    return await db.getAllKeys(STORE_NAME) as string[];
  } catch {
    return [];
  }
}
