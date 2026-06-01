import { b } from '../telegram/format.js';

export interface PostHogMetrics {
  dau: number;
  wau: number;
  topEvents: { name: string; count: number }[];
}

export async function getPostHogMetrics(): Promise<PostHogMetrics | null> {
  const apiKey    = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  const host    = (process.env.VITE_POSTHOG_HOST ?? 'https://us.posthog.com').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  async function trend(body: object) {
    const res = await fetch(`${host}/api/projects/${projectId}/insights/trend/`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PostHog trend ${res.status}`);
    return (await res.json()) as { result: { data: number[]; action?: { name: string } }[] };
  }

  try {
    const pageviewDau = { id: '$pageview', math: 'dau', type: 'events' };

    const [dauRes, wauRes, eventsRes] = await Promise.all([
      trend({ events: [pageviewDau], date_from: '-1d', interval: 'day' }),
      trend({ events: [pageviewDau], date_from: '-7d', interval: 'week' }),
      trend({
        events: [
          { id: 'trade_logged',   math: 'total', type: 'events' },
          { id: 'user_signed_up', math: 'total', type: 'events' },
          { id: '$pageview',      math: 'total', type: 'events' },
        ],
        date_from: '-7d',
        interval:  'day',
      }),
    ]);

    const lastOf = (arr: number[]) => arr.at(-1) ?? 0;
    const sumOf  = (arr: number[]) => arr.reduce((a, n) => a + n, 0);

    const topEvents = eventsRes.result
      .map(r => ({ name: (r as { action: { name: string } }).action?.name ?? 'unknown', count: sumOf(r.data) }))
      .sort((a, z) => z.count - a.count);

    return {
      dau:       lastOf(dauRes.result[0]?.data ?? []),
      wau:       lastOf(wauRes.result[0]?.data ?? []),
      topEvents,
    };
  } catch (err) {
    console.error('getPostHogMetrics error:', err);
    return null;
  }
}

export function formatPostHogMetrics(m: PostHogMetrics): string {
  const events = m.topEvents.length
    ? m.topEvents.map(e => `  • ${e.name}: ${b(e.count)}`).join('\n')
    : '  No event data';

  return [
    b('📊 Analytics (PostHog)'),
    `DAU: ${b(m.dau)}  •  WAU: ${b(m.wau)}`,
    '',
    b('Events — last 7d'),
    events,
  ].join('\n');
}
