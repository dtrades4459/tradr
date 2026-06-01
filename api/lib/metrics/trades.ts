import { getAdminClient } from '../supabaseAdmin.js';
import { b } from '../telegram/format.js';

export interface TradeMetrics {
  total: number;
  today: number;
  last7d: number;
  topStrategies: { strategy: string; count: number }[];
}

export async function getTradeMetrics(): Promise<TradeMetrics> {
  const db = getAdminClient();
  const { data, error } = await db.rpc('get_trade_stats');
  if (error) throw new Error(`get_trade_stats: ${error.message}`);
  const d = data as Record<string, unknown>;
  return {
    total:         d.total as number,
    today:         d.today as number,
    last7d:        d.last_7d as number,
    topStrategies: (d.top_strategies as { strategy: string; count: number }[] | null) ?? [],
  };
}

export function formatTradeMetrics(m: TradeMetrics): string {
  const strats = m.topStrategies.length
    ? m.topStrategies.map(s => `  • ${s.strategy}: ${b(s.count)}`).join('\n')
    : '  No strategy data yet';

  return [
    b('📈 Trades'),
    `Total: ${b(m.total)}  •  Today: ${b(m.today)}  •  Last 7d: ${b(m.last7d)}`,
    '',
    b('Top Strategies (all-time)'),
    strats,
  ].join('\n');
}
