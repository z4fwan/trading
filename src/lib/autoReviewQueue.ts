import { getReviewQueueItems, updateReviewQueueItem } from './reviewQueueStore';
import { deepVerifyEvent } from './llmIntegration';

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function runAutoReviewCycle() {
  const items = getReviewQueueItems();
  const now = Date.now();

  for (const item of items) {
    if (item.status === 'PENDING') {
      const age = now - item.timestamp;
      
      // If unhandled for 15 minutes (or 2 minutes in dev for testing)
      const threshold = process.env.NODE_ENV === 'development' ? 2 * 60 * 1000 : TIMEOUT_MS;
      
      if (age > threshold) {
        console.log(`[AutoReview] Deep studying abandoned review item: ${item.title}`);
        
        // Execute deep AI study
        const result = await deepVerifyEvent(item.title, item.source);
        
        // Update the item
        updateReviewQueueItem(item.id, {
          status: result.action === 'APPROVE' ? 'AUTO_APPROVED_BY_AI' : 'AUTO_REJECTED_BY_AI',
          aiDeepStudy: result.reasoning
        });
        
        console.log(`[AutoReview] Result for ${item.title}: ${result.action}`);
      }
    }
  }
}
