import { describe, it, expect } from 'vitest';
import { zonedDateTimeToIso, localDateTimeInZone, isValidTimezone, formatScheduledTime } from '@/lib/scheduling/time';

describe('campaign schedule timezone handling', () => {
  it.each([
    ['2026-09-06T11:51', 'Asia/Calcutta', '2026-09-06T06:21:00.000Z'],
    ['2026-09-06T11:51', 'Asia/Kolkata', '2026-09-06T06:21:00.000Z'],
    ['2026-01-15T09:00', 'America/New_York', '2026-01-15T14:00:00.000Z'],
    ['2026-07-15T09:00', 'America/New_York', '2026-07-15T13:00:00.000Z'],
    ['2026-09-06T00:00', 'Asia/Kolkata', '2026-09-05T18:30:00.000Z'],
    ['2026-09-06T11:51', 'UTC', '2026-09-06T11:51:00.000Z'],
  ])('converts %s in %s once', (local, zone, utc) => {
    expect(zonedDateTimeToIso(local, zone)).toBe(utc);
    expect(localDateTimeInZone(new Date(utc), zone)).toBe(local);
  });

  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])('rejects skipped/repeated DST time %s', (local) => {
    expect(() => zonedDateTimeToIso(local, 'America/New_York')).toThrow('daylight saving');
  });

  it('rejects invalid dates and timezone names', () => {
    expect(isValidTimezone('invalid')).toBe(false);
    expect(() => zonedDateTimeToIso('2026-09-06T11:51', 'invalid')).toThrow('timezone');
    expect(() => zonedDateTimeToIso('2026-02-30T11:51', 'UTC')).toThrow();
    expect(formatScheduledTime(null)).toBe('—');
    expect(formatScheduledTime('2026-09-06T06:21:00Z', 'Asia/Calcutta')).toContain('Asia/Calcutta');
  });
});
