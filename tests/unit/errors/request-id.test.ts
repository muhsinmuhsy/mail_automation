import { describe, it, expect } from 'vitest';
import { getRequestId } from '@/lib/errors/request-id';

describe('lib/errors/request-id', () => {
  it('returns the existing request id header when present', () => {
    const req = new Request('https://api.test/x', {
      headers: { 'X-Request-ID': 'existing-id' },
    });
    expect(getRequestId(req)).toBe('existing-id');
  });

  it('generates a uuid when no header is present', () => {
    const req = new Request('https://api.test/x');
    const id = getRequestId(req);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
