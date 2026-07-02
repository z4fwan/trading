import { getReviewQueueItems } from '@/lib/reviewQueueStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = getReviewQueueItems();
  return Response.json({ items });
}
