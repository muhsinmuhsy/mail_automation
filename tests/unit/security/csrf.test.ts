import { describe, expect, it } from 'vitest';
import { assertSameOriginForCookieMutation } from '@/lib/security/csrf';
import { ForbiddenError } from '@/lib/errors';

describe('assertSameOriginForCookieMutation', () => {
  it('allows safe methods without origin headers', () => {
    const req = new Request('https://app.test/api/contacts', {
      method: 'GET',
      headers: { cookie: 'sid=1' },
    });

    expect(() => assertSameOriginForCookieMutation(req)).not.toThrow();
  });

  it('allows unsafe same-origin cookie requests', () => {
    const req = new Request('https://app.test/api/contacts', {
      method: 'POST',
      headers: { cookie: 'sid=1', origin: 'https://app.test' },
    });

    expect(() => assertSameOriginForCookieMutation(req)).not.toThrow();
  });

  it('allows same-origin referer when origin is absent', () => {
    const req = new Request('https://app.test/api/contacts', {
      method: 'DELETE',
      headers: { cookie: 'sid=1', referer: 'https://app.test/contacts' },
    });

    expect(() => assertSameOriginForCookieMutation(req)).not.toThrow();
  });

  it('blocks cross-origin unsafe cookie requests', () => {
    const req = new Request('https://app.test/api/contacts', {
      method: 'POST',
      headers: { cookie: 'sid=1', origin: 'https://evil.test' },
    });

    expect(() => assertSameOriginForCookieMutation(req)).toThrow(ForbiddenError);
  });

  it('blocks unsafe cookie requests missing origin and referer', () => {
    const req = new Request('https://app.test/api/contacts', {
      method: 'PATCH',
      headers: { cookie: 'sid=1' },
    });

    expect(() => assertSameOriginForCookieMutation(req)).toThrow(ForbiddenError);
  });

  it('does not require browser origin headers for non-cookie API requests', () => {
    const req = new Request('https://app.test/api/contacts', { method: 'POST' });

    expect(() => assertSameOriginForCookieMutation(req)).not.toThrow();
  });
});
