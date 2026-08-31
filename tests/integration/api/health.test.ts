import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns an ok status payload with the app version', async () => {
    const response = await GET();
    const body = (await response.json()) as { status: string; version: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', version: '1.0.0' });
  });

  it('responds with JSON content type', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
