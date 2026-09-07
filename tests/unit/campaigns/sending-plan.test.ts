import { describe, it, expect } from 'vitest';
import { campaignEmailTime } from '@/lib/scheduling/campaign';

const start = new Date('2030-01-01T09:00:00Z');
describe('campaign sending plan', () => {
  it('schedules 50 recipients as 20, 20, and 10 with five-minute gaps', () => {
    const times = Array.from({ length: 50 }, (_, i) => campaignEmailTime(start, i, 5, 20).toISOString());
    expect(times[0]).toBe('2030-01-01T09:00:00.000Z');
    expect(times[1]).toBe('2030-01-01T09:05:00.000Z');
    expect(times[19]).toBe('2030-01-01T10:35:00.000Z');
    expect(times[20]).toBe('2030-01-02T09:00:00.000Z');
    expect(times[40]).toBe('2030-01-03T09:00:00.000Z');
    expect(times[49]).toBe('2030-01-03T09:45:00.000Z');
  });
  it('continues at the interval with no cap, including across midnight', () => {
    expect(campaignEmailTime(start, 100, 15, null).toISOString()).toBe('2030-01-02T10:00:00.000Z');
  });
  it('keeps one-per-day batches 24 hours apart', () => {
    expect(campaignEmailTime(start, 2, 5, 1).toISOString()).toBe('2030-01-03T09:00:00.000Z');
  });
  it('never overlaps batches when the interval makes a batch exceed 24 hours', () => {
    const times = Array.from({ length: 50 }, (_, i) => campaignEmailTime(start, i, 120, 20).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(120 * 60_000);
  });
  it('rejects invalid values rather than generating invalid dates', () => {
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => campaignEmailTime(start, 0, value, 20)).toThrow();
      expect(() => campaignEmailTime(start, 0, 5, value)).toThrow();
    }
  });
});
