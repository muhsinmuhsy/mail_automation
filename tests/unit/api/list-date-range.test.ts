import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { parseListQuery, dateRangeWhere } from '@/lib/api/list';

function makeReq(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

describe('parseListQuery — date range parsing', () => {
  it('parses startDate and endDate when dateRange is true', () => {
    const req = makeReq('/api/test?page=1&limit=20&startDate=2026-09-01&endDate=2026-09-30');
    const result = parseListQuery(req, { dateRange: true });
    expect(result.startDate).toBe('2026-09-01');
    expect(result.endDate).toBe('2026-09-30');
  });

  it('returns undefined for dates when dateRange is not set', () => {
    const req = makeReq('/api/test?page=1&limit=20&startDate=2026-09-01&endDate=2026-09-30');
    const result = parseListQuery(req);
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('returns undefined for empty date params', () => {
    const req = makeReq('/api/test?page=1&limit=20');
    const result = parseListQuery(req, { dateRange: true });
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('returns undefined for whitespace-only date params', () => {
    const req = makeReq('/api/test?page=1&limit=20&startDate=%20%20&endDate=%20%20');
    const result = parseListQuery(req, { dateRange: true });
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('parses only startDate when endDate is absent', () => {
    const req = makeReq('/api/test?page=1&limit=20&startDate=2026-09-01');
    const result = parseListQuery(req, { dateRange: true });
    expect(result.startDate).toBe('2026-09-01');
    expect(result.endDate).toBeUndefined();
  });

  it('parses only endDate when startDate is absent', () => {
    const req = makeReq('/api/test?page=1&limit=20&endDate=2026-09-30');
    const result = parseListQuery(req, { dateRange: true });
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBe('2026-09-30');
  });
});

describe('dateRangeWhere — Prisma where fragment builder', () => {
  it('returns empty object when neither date is provided', () => {
    expect(dateRangeWhere('created_at')).toEqual({});
  });

  it('returns empty object when both dates are undefined', () => {
    expect(dateRangeWhere('created_at', undefined, undefined)).toEqual({});
  });

  it('builds only gte when only startDate is provided', () => {
    const result = dateRangeWhere('created_at', '2026-09-01', undefined);
    expect(result).toEqual({
      created_at: { gte: new Date('2026-09-01') },
    });
  });

  it('builds only lte when only endDate is provided', () => {
    const result = dateRangeWhere('created_at', undefined, '2026-09-30');
    expect(result).toEqual({
      created_at: { lte: new Date('2026-09-30T23:59:59.999Z') },
    });
  });

  it('builds both gte and lte when both dates are provided', () => {
    const result = dateRangeWhere('created_at', '2026-09-01', '2026-09-30');
    expect(result).toEqual({
      created_at: {
        gte: new Date('2026-09-01'),
        lte: new Date('2026-09-30T23:59:59.999Z'),
      },
    });
  });

  it('appends T23:59:59.999Z to endDate for inclusive end-of-day', () => {
    const result = dateRangeWhere('created_at', undefined, '2026-01-15');
    expect(result.created_at?.lte).toEqual(new Date('2026-01-15T23:59:59.999Z'));
  });

  it('works with a different field name', () => {
    const result = dateRangeWhere('sent_at', '2026-09-01', '2026-09-30');
    expect(result).toHaveProperty('sent_at');
    expect(result).not.toHaveProperty('created_at');
  });
});
