// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../supabaseAdmin.js', () => ({
  getAdminClient: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: {
        total: 500,
        today: 12,
        last_7d: 47,
        top_strategies: [
          { strategy: 'Breakout', count: 120 },
          { strategy: 'Scalp', count: 98 },
        ],
      },
      error: null,
    }),
  }),
}));

import { getTradeMetrics } from '../trades.js';

describe('getTradeMetrics', () => {
  it('returns shaped trade metrics from rpc', async () => {
    const m = await getTradeMetrics();
    expect(m.total).toBe(500);
    expect(m.today).toBe(12);
    expect(m.last7d).toBe(47);
    expect(m.topStrategies).toHaveLength(2);
    expect(m.topStrategies[0]).toEqual({ strategy: 'Breakout', count: 120 });
  });
});
