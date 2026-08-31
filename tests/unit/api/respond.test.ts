import { describe, it, expect } from 'vitest';
import { respondOk, respondError, respondList } from '@/lib/api/respond';
import { ValidationError, RateLimitError } from '@/lib/errors';

type JsonBody = {
  success?: boolean;
  data?: unknown;
  message?: string;
  error: { type?: string; message?: string; retryAfter?: number };
  pagination?: unknown;
};

describe('lib/api/respond', () => {
  describe('respondOk', () => {
    it('returns a success envelope with the request id header', async () => {
      const res = respondOk({ id: '1' }, 'req_abc');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Request-ID')).toBe('req_abc');
      const body = (await res.json()) as JsonBody;
      expect(body).toEqual({ success: true, data: { id: '1' } });
    });

    it('honours an optional message and status code', async () => {
      const res = respondOk({ ok: true }, 'req_2', 'All good', 201);
      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
      expect(body.message).toBe('All good');
    });
  });

  describe('respondError', () => {
    it('wraps an AppError using its request id', async () => {
      const err = new ValidationError('bad field');
      const res = respondError(err, 'req_err');
      expect(res.status).toBe(400);
      expect(res.headers.get('X-Request-ID')).toBe('req_err');
      const body = (await res.json()) as JsonBody;
      expect(body.error.type).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('bad field');
    });

    it('sets a Retry-After header when the error carries retryAfter', async () => {
      const err = new RateLimitError('slow', 45);
      const res = respondError(err, 'req_rl');
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('45');
      const body = (await res.json()) as JsonBody;
      expect(body.error.retryAfter).toBe(45);
    });

    it('generates a request id when none is supplied', async () => {
      const res = respondError(new ValidationError('x'));
      expect(res.headers.get('X-Request-ID')).toBeTruthy();
    });
  });

  describe('respondList', () => {
    it('returns items plus pagination metadata and request id', async () => {
      const res = respondList([{ id: 'a' }, { id: 'b' }], 42, 1, 20, 'req_list');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Request-ID')).toBe('req_list');
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({ total: 42, page: 1, pageSize: 20, totalPages: 3 });
    });

    it('includes an optional message', async () => {
      const res = respondList([], 0, 1, 10, 'req_list2', 'Nothing yet');
      const body = (await res.json()) as JsonBody;
      expect(body.message).toBe('Nothing yet');
    });
  });
});
