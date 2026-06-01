// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getPostHogMetrics } from '../analytics.js';

describe('getPostHogMetrics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns null when env vars missing', async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    expect(await getPostHogMetrics()).toBeNull();
  });

  it('returns DAU, WAU, and summed event counts', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID       = '12345';
    process.env.VITE_POSTHOG_HOST        = 'https://eu.posthog.com';

    // DAU response
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: [{ data: [3, 5], days: ['2026-05-31', '2026-06-01'] }] }) });
    // WAU response
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: [{ data: [23], days: ['2026-05-26'] }] }) });
    // Events response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: [
          { action: { name: 'trade_logged' }, data: [10, 8, 9] },
          { action: { name: 'user_signed_up' }, data: [2, 1, 3] },
        ],
      }),
    });

    const m = await getPostHogMetrics();
    expect(m).not.toBeNull();
    expect(m!.dau).toBe(5);   // last value of DAU series
    expect(m!.wau).toBe(23);
    expect(m!.topEvents[0]).toEqual({ name: 'trade_logged', count: 27 });
    expect(m!.topEvents[1]).toEqual({ name: 'user_signed_up', count: 6 });
  });
});
