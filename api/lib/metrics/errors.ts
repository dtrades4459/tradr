import { b, link } from '../telegram/format.js';

const SENTRY_BASE = 'https://sentry.io/api/0';

async function sentryGet(path: string) {
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Sentry ${res.status}: ${path}`);
  return res.json();
}

export interface SentryIssue {
  id: string;
  title: string;
  count: number;
  lastSeen: string;
  permalink: string;
}

export interface SentryMetrics {
  issues: SentryIssue[];
  errorCount24h: number;
}

export async function getSentryMetrics(): Promise<SentryMetrics | null> {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return null;

  try {
    const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const until = Math.floor(Date.now() / 1000);

    const [issues, stats] = await Promise.all([
      sentryGet(`/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved&limit=10&sort=date`),
      sentryGet(`/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/stats/?stat=received&since=${since}&until=${until}&resolution=1h`),
    ]);

    return {
      issues: (issues as Record<string, unknown>[]).map(i => ({
        id:        String(i.id),
        title:     String(i.title),
        count:     parseInt(String(i.count), 10),
        lastSeen:  String(i.lastSeen),
        permalink: String(i.permalink),
      })),
      errorCount24h: (stats as [number, number][]).reduce((sum, [, count]) => sum + count, 0),
    };
  } catch (err) {
    console.error('getSentryMetrics error:', err);
    return null;
  }
}

export function formatSentryMetrics(m: SentryMetrics): string {
  const issueLines = m.issues.length
    ? m.issues.map(i => `  • ${link(i.title.slice(0, 55), i.permalink)} (${i.count}×)`)
    : ['  No unresolved issues 🎉'];

  return [
    b('🚨 Sentry — last 24h'),
    `Total errors: ${b(m.errorCount24h)}`,
    '',
    b('Unresolved issues'),
    ...issueLines,
  ].join('\n');
}
