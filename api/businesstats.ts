export const config = { runtime: 'nodejs' };

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void };

import { timingSafeEqual } from 'crypto';
import { isAuthorized, getChatId, type TelegramUpdate } from './lib/telegram/auth.js';
import { b } from './lib/telegram/format.js';
import { getUserMetrics, formatUserMetrics } from './lib/metrics/users.js';
import { getTradeMetrics, formatTradeMetrics } from './lib/metrics/trades.js';
import { getRevenueMetrics, formatRevenueMetrics } from './lib/metrics/revenue.js';
import { getSentryMetrics, formatSentryMetrics } from './lib/metrics/errors.js';

const TOKEN  = process.env.TELEGRAM_BUSINESSTATS_TOKEN!;
const SECRET = process.env.TELEGRAM_BUSINESSTATS_SECRET!;

export async function sendMessage(chatId: number | string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('Telegram sendMessage failed:', res.status, await res.text());
}

function integrationStatus() {
  return [
    process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Supabase' : '❌ Supabase',
    process.env.STRIPE_SECRET_KEY         ? '✅ Stripe'   : '❌ Stripe',
    process.env.SENTRY_AUTH_TOKEN         ? '✅ Sentry'   : '❌ Sentry (commands disabled)',
    process.env.POSTHOG_PERSONAL_API_KEY  ? '✅ PostHog'  : '❌ PostHog (commands disabled)',
  ];
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, [
    b('📊 Kōda Ops Bot'),
    '',
    b('Business'),
    '/users — signups + active users',
    '/waitlist — beta waitlist count',
    '/revenue — MRR, subs, churn',
    '/trades — trade volume + activity',
    '',
    b('Monitoring'),
    '/errors — latest Sentry issues',
    '/analytics — DAU/WAU (PostHog)',
    '',
    b('Utility'),
    '/health — integration status',
    '/user email@example.com — user lookup',
    '/digest — run daily digest now',
    '',
    b('Integrations'),
    ...integrationStatus(),
  ].join('\n'));
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  const incoming = Buffer.from(secret ?? '', 'utf8');
  const expected = Buffer.from(SECRET, 'utf8');
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    return res.status(401).end();
  }

  const update = req.body as unknown as TelegramUpdate;
  if (!isAuthorized(update)) return res.status(200).end();

  const text    = update.message?.text ?? '';
  const chatId  = getChatId(update);
  const command = text.split(' ')[0].toLowerCase().replace(/@\w+$/, '');

  try {
    switch (command) {
      case '/start':
      case '/help':
        await handleHelp(chatId);
        break;
      case '/users':
      case '/waitlist': {
        await sendMessage(chatId, '⏳ Fetching...');
        const m = await getUserMetrics();
        await sendMessage(chatId, formatUserMetrics(m));
        break;
      }
      case '/trades': {
        await sendMessage(chatId, '⏳ Fetching...');
        const m = await getTradeMetrics();
        await sendMessage(chatId, formatTradeMetrics(m));
        break;
      }
      case '/revenue': {
        await sendMessage(chatId, '⏳ Fetching...');
        const m = await getRevenueMetrics();
        await sendMessage(chatId, formatRevenueMetrics(m));
        break;
      }
      case '/errors': {
        await sendMessage(chatId, '⏳ Fetching...');
        const m = await getSentryMetrics();
        if (!m) {
          await sendMessage(chatId, '❌ Sentry unavailable — check SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in Vercel env, or Sentry may be unreachable.');
          break;
        }
        await sendMessage(chatId, formatSentryMetrics(m));
        break;
      }
      // Further commands added in subsequent tasks
    }
  } catch (err) {
    console.error('businesstats bot error:', err);
    await sendMessage(chatId, '❌ Internal error — check Vercel logs.');
  }

  return res.status(200).end();
}
