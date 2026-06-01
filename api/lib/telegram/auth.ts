export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
  };
}

const ALLOWED_USER_IDS = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0),
);

const OPS_CHAT_ID = parseInt(process.env.TELEGRAM_OPS_CHAT_ID ?? '0', 10);

export function isAuthorized(update: TelegramUpdate): boolean {
  const msg = update.message;
  if (!msg) return false;
  const userId = msg.from?.id;
  if (!userId || !ALLOWED_USER_IDS.has(userId)) return false;
  return msg.chat.type === 'private' || msg.chat.id === OPS_CHAT_ID;
}

export function getChatId(update: TelegramUpdate): number {
  if (!update.message) throw new Error('getChatId called on update without message');
  return update.message.chat.id;
}
