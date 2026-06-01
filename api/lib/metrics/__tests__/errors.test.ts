// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getSentryMetrics } from '../errors.js';

describe('getSentryMetrics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns null when SENTRY_AUTH_TOKEN is missing', async () => {
    delete process.env.SENTRY_AUTH_TOKEN;
    expect(await getSentryMetrics()).toBeNull();
  });

  it('returns issues and 24h error count', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'test-token';
    process.env.SENTRY_ORG       = 'koda-tt';
    process.env.SENTRY_PROJECT   = 'test-project';

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: '1', title: 'TypeError: x is undefined', count: '42', lastSeen: '2026-06-01T10:00:00Z', permalink: 'https://sentry.io/issues/1/' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [[1748736000, 10], [1748739600, 5], [1748743200, 8]],
      });

    const m = await getSentryMetrics();
    expect(m).not.toBeNull();
    expect(m!.issues).toHaveLength(1);
    expect(m!.issues[0].count).toBe(42);
    expect(m!.errorCount24h).toBe(23);
  });
});
