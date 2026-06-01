import { getAdminClient } from '../supabaseAdmin.js';
import { b } from '../telegram/format.js';

export interface UserMetrics {
  total: number;
  today: number;
  last7d: number;
  last30d: number;
  active30d: number;
  waitlist: number;
}

export async function getUserMetrics(): Promise<UserMetrics> {
  const db = getAdminClient();

  const [statsRes, waitlistRes] = await Promise.all([
    db.rpc('get_user_stats'),
    db.from('waitlist').select('*', { count: 'exact', head: true }),
  ]);

  if (statsRes.error) throw new Error(`get_user_stats: ${statsRes.error.message}`);

  const s = statsRes.data as Record<string, number>;
  return {
    total:     s.total,
    today:     s.today,
    last7d:    s.last_7d,
    last30d:   s.last_30d,
    active30d: s.active_30d,
    waitlist:  waitlistRes.count ?? 0,
  };
}

export function formatUserMetrics(m: UserMetrics): string {
  return [
    b('👥 Users'),
    `Total: ${b(m.total)}  •  Active 30d: ${b(m.active30d)}`,
    `New today: ${b(m.today)}  •  Last 7d: ${b(m.last7d)}  •  Last 30d: ${b(m.last30d)}`,
    '',
    b('📋 Waitlist'),
    `${b(m.waitlist)} pending signups`,
  ].join('\n');
}
