// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const { mockSubs, mockEvents } = vi.hoisted(() => ({
  mockSubs: { list: vi.fn() },
  mockEvents: { list: vi.fn() },
}));

vi.mock('stripe', () => ({ default: vi.fn(function () { return { subscriptions: mockSubs, events: mockEvents }; }) }));

import { getRevenueMetrics } from '../revenue.js';

describe('getRevenueMetrics', () => {
  it('calculates MRR from monthly + annual subs and counts churn events', async () => {
    mockSubs.list
      .mockReturnValueOnce({ autoPagingToArray: async () => [
        { id: 'sub_1', currency: 'gbp', items: { data: [{ price: { unit_amount: 1000, recurring: { interval: 'month' } }, quantity: 1 }] } },
        { id: 'sub_2', currency: 'gbp', items: { data: [{ price: { unit_amount: 1200, recurring: { interval: 'year' } }, quantity: 1 }] } },
      ]})
      .mockReturnValueOnce({ autoPagingToArray: async () => [{ id: 'sub_3' }] });

    mockEvents.list.mockReturnValue({ autoPagingToArray: async () => [{ id: 'evt_1' }] });

    const m = await getRevenueMetrics();
    // £10/mo + £12k/yr÷12=£1/mo = £11 MRR
    expect(m.mrr).toBeCloseTo(11.0, 1);
    expect(m.currency).toBe('GBP');
    expect(m.activeCount).toBe(2);
    expect(m.newThisWeek).toBe(1);
    expect(m.churnedThisWeek).toBe(1);
    expect(m.wowDelta).toBe(0);
  });
});
