import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/auth/neon-auth', () => ({ auth: { middleware: () => async () => NextResponse.next(), getSession: vi.fn() } }));
import proxy from '@/proxy';

describe('public navigation and authentication rate limits', () => {
  it('allows repeated login navigation and prefetch without consuming the login-attempt quota', async () => {
    for (let index = 0; index < 15; index++) {
      expect((await proxy(new NextRequest('http://localhost/login', { headers: { 'x-forwarded-for': '192.0.2.41' } }))).status).toBe(200);
    }
    for (let index = 0; index < 10; index++) {
      expect((await proxy(new NextRequest('http://localhost/login', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.41' } }))).status).toBe(200);
    }
    expect((await proxy(new NextRequest('http://localhost/login', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.41' } }))).status).toBe(429);
  });
  it('retains strict limits on the authentication API', async () => {
    for (let index = 0; index < 10; index++) {
      expect((await proxy(new NextRequest('http://localhost/api/auth/sign-in/email', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.42' } }))).status).toBe(200);
    }
    expect((await proxy(new NextRequest('http://localhost/api/auth/sign-in/email', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.42' } }))).status).toBe(429);
  });
});
