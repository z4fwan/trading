import fs from 'fs/promises';
import path from 'path';
import { EngineHealth } from './engineState';

const DB_PATH = path.join(process.cwd(), '.quantum_db.json');
const WRITE_LOCK_KEY = '__quantumDbWriteLock';
let writePending = false;

interface PersistedState {
  engineHealth?: Partial<EngineHealth>;
  predictions?: any[];
  timestamp: number;
}

async function acquireLock(maxWait = 3000): Promise<boolean> {
  const g = globalThis as unknown as Record<string, number | undefined>;
  const start = Date.now();
  while ((g[WRITE_LOCK_KEY] ?? 0) > Date.now()) {
    if (Date.now() - start > maxWait) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  g[WRITE_LOCK_KEY] = Date.now() + 5000;
  return true;
}

function releaseLock(): void {
  const g = globalThis as unknown as Record<string, number | undefined>;
  g[WRITE_LOCK_KEY] = 0;
}

export async function saveToLocalDb(state: PersistedState): Promise<void> {
  if (writePending) return;
  writePending = true;
  try {
    if (!(await acquireLock())) return;
    const tmpPath = DB_PATH + '.tmp';
    const data = JSON.stringify(state);
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, DB_PATH);
  } catch (error) {
    console.warn(`[LocalDB] Failed to save state:`, error);
  } finally {
    releaseLock();
    writePending = false;
  }
}

export async function loadFromLocalDb(): Promise<PersistedState | null> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data) as PersistedState;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`[LocalDB] Failed to load state:`, error);
    }
    return null;
  }
}
