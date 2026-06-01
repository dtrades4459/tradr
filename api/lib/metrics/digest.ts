import { getUserMetrics }    from './users.js';
import { getRevenueMetrics } from './revenue.js';
import { getTradeMetrics }   from './trades.js';
import { getSentryMetrics }  from './errors.js';
import { getPostHogMetrics } from './analytics.js';
import { b } from '../telegram/format.js';

const TOKEN    = process.env.TELEGRAM_BUSINESSTATS_TOKEN!;
const OPS_CHAT = process.env.TELEGRAM_OPS_CHAT_ID!;

async function post(text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: OPS_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('digest post failed:', res.status, await res.text());
}

export async function sendDailyDigest() {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  await post(b(`☀️ Daily Digest — ${date}`));

  const [users, revenue, trades, sentry, posthog] = await Promise.allSettled([
    getUserMetrics(),
    getRevenueMetrics(),
    getTradeMetrics(),
    getSentryMetrics(),
    getPostHogMetrics(),
  ]);

  const sections: string[] = [];

  if (users.status === 'fulfilled') {
    const m = users.value;
    sections.push([
      b('👥 Users'),
      `Total: ${b(m.total)}  •  Active 30d: ${b(m.active30d)}`,
      `New today: ${b(m.today)}  •  Waitlist: ${b(m.waitlist)}`,
    ].join('\n'));
  } else {
    sections.push(`${b('👥 Users')} — ❌ ${String(users.reason)}`);
  }

  if (revenue.status === 'fulfilled') {
    const m = revenue.value;
    const sym = m.currency === 'GBP' ? '£' : m.currency + ' ';
    sections.push([
      b('💰 Revenue'),
      `MRR: ${b(`${sym}${m.mrr.toFixed(2)}`)}  •  Active subs: ${b(m.activeCount)}`,
      `New this week: ${b(m.newThisWeek)}  •  Churned: ${b(m.churnedThisWeek)}`,
    ].join('\n'));
  } else {
    sections.push(`${b('💰 Revenue')} — ❌ ${String(revenue.reason)}`);
  }

  if (trades.status === 'fulfilled') {
    const m = trades.value;
    sections.push([
      b('📈 Trades'),
      `Total: ${b(m.total)}  •  Today: ${b(m.today)}  •  Last 7d: ${b(m.last7d)}`,
    ].join('\n'));
  } else {
    sections.push(`${b('📈 Trades')} — ❌ ${String(trades.reason)}`);
  }

  if (sentry.status === 'fulfilled' && sentry.value) {
    const m = sentry.value;
    sections.push([
      b('🚨 Errors (24h)'),
      `${b(m.errorCount24h)} events  •  ${b(m.issues.length)} unresolved issues`,
    ].join('\n'));
  }

  if (posthog.status === 'fulfilled' && posthog.value) {
    const m = posthog.value;
    sections.push([
      b('📊 Usage'),
      `DAU: ${b(m.dau)}  •  WAU: ${b(m.wau)}`,
    ].join('\n'));
  }

  await post(sections.join('\n\n'));
}
