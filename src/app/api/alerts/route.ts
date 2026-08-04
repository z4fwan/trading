import { NextRequest } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramBot';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    if (!message) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    const result = await sendTelegramMessage(message);
    if (result) {
      return Response.json({ success: true });
    } else {
      return Response.json({ error: 'Failed to send Telegram message. Check .env config' }, { status: 500 });
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
