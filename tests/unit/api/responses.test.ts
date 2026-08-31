import { describe, it, expect } from 'vitest';
import { ok, created, noContent, paginated } from '@/lib/api/responses';

describe('lib/api/responses', () => {
  it('ok wraps data with a 200 default', async () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { hello: 'world' } });
  });

  it('ok honours a custom ResponseInit', async () => {
    const res = ok({ a: 1 }, { status: 200, headers: { 'X-Custom': 'yes' } });
    expect(res.headers.get('X-Custom')).toBe('yes');
  });

  it('created returns 201', async () => {
    const res = created({ id: '9' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: '9' } });
  });

  it('noContent returns a 204 with an empty body', () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('paginated attaches pagination metadata', async () => {
    const res = paginated([1, 2], 5, 1, 2);
    expect(await res.json()).toEqual({
      data: [1, 2],
      pagination: { total: 5, page: 1, pageSize: 2, totalPages: 3 },
    });
  });
});
