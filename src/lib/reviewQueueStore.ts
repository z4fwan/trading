export type ReviewStatus = 'PENDING' | 'APPROVED_BY_HUMAN' | 'REJECTED_BY_HUMAN' | 'AUTO_APPROVED_BY_AI' | 'AUTO_REJECTED_BY_AI';

export interface ReviewQueueItem {
  id: string;
  title: string;
  description: string;
  source: string;
  timestamp: number;
  status: ReviewStatus;
  aiDeepStudy?: string;
  similarEventsCount: number;
  aiProbability: number;
}

// Global singleton state for Review Queue
const GLOBAL_KEY = '__quantumReviewQueue';

function getStore(): ReviewQueueItem[] {
  const g = globalThis as unknown as Record<string, ReviewQueueItem[] | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = [];
  }
  return g[GLOBAL_KEY]!;
}

export function getReviewQueueItems(): ReviewQueueItem[] {
  return getStore();
}

export function addReviewQueueItem(item: Omit<ReviewQueueItem, 'id' | 'timestamp' | 'status'>) {
  const store = getStore();
  const newItem: ReviewQueueItem = {
    ...item,
    id: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: Date.now(),
    status: 'PENDING',
  };
  store.unshift(newItem);
  
  // Keep bounded
  if (store.length > 100) store.length = 100;
  return newItem;
}

export function updateReviewQueueItem(id: string, updates: Partial<ReviewQueueItem>) {
  const store = getStore();
  const index = store.findIndex(i => i.id === id);
  if (index !== -1) {
    store[index] = { ...store[index], ...updates };
  }
}
