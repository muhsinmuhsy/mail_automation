import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { parseListQuery, listMeta } from '@/lib/api/list';

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

describe('lib/api/list', () => {
  describe('parseListQuery', () => {
    it('applies safe defaults when nothing is provided', () => {
      const q = parseListQuery(makeReq('https://api.test/items'));
      expect(q).toEqual({
        page: 1,
        limit: 20,
        search: undefined,
        sortBy: undefined,
        sortOrder: 'asc',
      });
    });

    it('parses page, limit and sortOrder from the query string', () => {
      const q = parseListQuery(makeReq('https://api.test/items?page=3&limit=15&sortOrder=desc'));
      expect(q.page).toBe(3);
      expect(q.limit).toBe(15);
      expect(q.sortOrder).toBe('desc');
    });

    it('coerces string numbers for page/limit', () => {
      const q = parseListQuery(makeReq('https://api.test/items?page=2&limit=5'));
      expect(q.page).toBe(2);
      expect(q.limit).toBe(5);
    });

    it('returns search only when search is enabled and non-blank', () => {
      const enabled = parseListQuery(makeReq('https://api.test/items?search=hello'), { search: true });
      expect(enabled.search).toBe('hello');

      const blank = parseListQuery(makeReq('https://api.test/items?search=%20'), { search: true });
      expect(blank.search).toBeUndefined();

      const disabled = parseListQuery(makeReq('https://api.test/items?search=hello'), {});
      expect(disabled.search).toBeUndefined();
    });

    it('trims surrounding whitespace from search', () => {
      const q = parseListQuery(makeReq('https://api.test/items?search=%20world%20'), { search: true });
      expect(q.search).toBe('world');
    });

    it('keeps sortBy only when it is in the allow-list', () => {
      const allowed = parseListQuery(makeReq('https://api.test/items?sortBy=name'), {
        sortable: ['name', 'created_at'],
      });
      expect(allowed.sortBy).toBe('name');

      const notAllowed = parseListQuery(makeReq('https://api.test/items?sortBy=evil'), {
        sortable: ['name', 'created_at'],
      });
      expect(notAllowed.sortBy).toBeUndefined();
    });

    it('ignores sortBy when no allow-list is provided', () => {
      const q = parseListQuery(makeReq('https://api.test/items?sortBy=name'));
      expect(q.sortBy).toBeUndefined();
    });

    it('rejects invalid page values (0 / negative)', () => {
      expect(() => parseListQuery(makeReq('https://api.test/items?page=0'))).toThrow();
      expect(() => parseListQuery(makeReq('https://api.test/items?page=-4'))).toThrow();
    });

    it('rejects out-of-range limit values (over 100 / non-numeric)', () => {
      expect(() => parseListQuery(makeReq('https://api.test/items?limit=200'))).toThrow();
      expect(() => parseListQuery(makeReq('https://api.test/items?limit=abc'))).toThrow();
    });
  });

  describe('listMeta', () => {
    it('computes totalPages from total and limit', () => {
      expect(listMeta(0, 1, 10)).toEqual({ total: 0, page: 1, pageSize: 10, totalPages: 1 });
      expect(listMeta(25, 1, 10)).toEqual({ total: 25, page: 1, pageSize: 10, totalPages: 3 });
      expect(listMeta(20, 2, 10)).toEqual({ total: 20, page: 2, pageSize: 10, totalPages: 2 });
    });

    it('never returns fewer than one page', () => {
      expect(listMeta(0, 5, 100).totalPages).toBe(1);
    });

    it('rounds up partial pages', () => {
      expect(listMeta(21, 1, 10).totalPages).toBe(3);
      expect(listMeta(1, 1, 50).totalPages).toBe(1);
    });
  });
});
