// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../supabaseAdmin.js', () => ({
  getAdminClient: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: { total: 42, today: 3, last_7d: 10, last_30d: 28, active_30d: 15 },
      error: null,
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ count: 7, error: null }),
    }),
  }),
}));

import { getUserMetrics } from '../users.js';

describe('getUserMetrics', () => {
  it('returns shaped metrics from rpc + waitlist count', async () => {
    const m = await getUserMetrics();
    expect(m).toEqual({ total: 42, today: 3, last7d: 10, last30d: 28, active30d: 15, waitlist: 7 });
  });
});
