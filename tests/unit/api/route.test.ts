import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Ctx = { user?: unknown; params: unknown };
type JsonBody = { user?: unknown; params?: unknown; success?: boolean; error?: unknown };

const mockRequireVerifiedUser = vi.fn();
const mockRequireUser = vi.fn();
const mockRequireAdmin = vi.fn();
const mockGetDbRole = vi.fn();
const mockEnforceRateLimit = vi.fn();
const mockRespondError = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerInfo = vi.fn();

vi.mock('@/lib/api/session', () => ({
  requireVerifiedUser: (...a: unknown[]) => mockRequireVerifiedUser(...a),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: (...a: unknown[]) => mockRequireUser(...a),
  requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a),
  getDbRole: (...a: unknown[]) => mockGetDbRole(...a),
}));

vi.mock('@/lib/rate-limit/middleware', () => ({
  enforceRateLimit: (...a: unknown[]) => mockEnforceRateLimit(...a),
}));

vi.mock('@/lib/api/respond', () => ({
  respondError: (...a: unknown[]) => mockRespondError(...a),
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    error: (...a: unknown[]) => mockLoggerError(...a),
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    info: (...a: unknown[]) => mockLoggerInfo(...a),
  },
}));

import { defineRoute } from '@/lib/api/route';
import { ValidationError } from '@/lib/errors';

function makeReq(url = 'https://api.test/x') {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRespondError.mockImplementation((err: unknown) =>
    NextResponse.json({ error: 'handled', name: (err as Error)?.constructor?.name }, { status: 500 }),
  );
  mockGetDbRole.mockResolvedValue('USER');
});

describe('lib/api/route', () => {
  it('runs the handler for a verified user by default', async () => {
    const user = { id: 'u1', email: 'a@b.c', emailVerified: true };
    mockRequireVerifiedUser.mockResolvedValue(user);

    const handler = vi.fn((_req: NextRequest, ctx: { user: unknown; params: unknown }) =>
      NextResponse.json({ user: ctx.user, params: ctx.params }),
    );

    const route = defineRoute(handler);
    const res = await route(makeReq(), { params: { id: '7' } });

    expect(mockRequireVerifiedUser).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.user).toEqual(user);
    expect(body.params).toEqual({ id: '7' });
  });

  it('resolves async (Promise) params', async () => {
    const user = { id: 'u1', email: 'a@b.c' };
    mockRequireVerifiedUser.mockResolvedValue(user);
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler);
    await route(makeReq(), { params: Promise.resolve({ id: 'p1' }) });
    expect(handler.mock.calls[0][1].params).toEqual({ id: 'p1' });
  });

  it('uses requireUser when verified is false', async () => {
    const user = { id: 'u2', email: 'a@b.c' };
    mockRequireUser.mockResolvedValue(user);
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler, { verified: false });
    await route(makeReq(), { params: {} });
    expect(mockRequireUser).toHaveBeenCalledOnce();
    expect(mockRequireVerifiedUser).not.toHaveBeenCalled();
  });

  it('uses requireAdmin for admin routes', async () => {
    const sessionUser = { id: 'u3', email: 'a@b.c' };
    mockRequireAdmin.mockResolvedValue({ sessionUser });
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler, { auth: 'admin' });
    await route(makeReq(), { params: {} });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][1].user).toEqual(sessionUser);
  });

  it('uses requireOwnership for ownership routes', async () => {
    const sessionUser = { id: 'u4', email: 'a@b.c' };
    mockRequireVerifiedUser.mockResolvedValue(sessionUser);
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler, {
      auth: { ownership: () => 'u4' },
    });
    await route(makeReq(), { params: { ownerId: 'owner-9' } });
    expect(mockRequireVerifiedUser).toHaveBeenCalledOnce();
    expect(mockGetDbRole).toHaveBeenCalledWith('u4');
    expect(handler.mock.calls[0][1].user).toEqual(sessionUser);
  });

  it('enforces rate limiting when a key is configured', async () => {
    mockRequireVerifiedUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler, { rateLimitKey: 'contacts:list' });
    await route(makeReq(), { params: {} });
    expect(mockEnforceRateLimit).toHaveBeenCalledWith('u1', 'contacts:list');
  });

  it('maps a thrown handler error through respondError', async () => {
    mockRequireVerifiedUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const boom = new Error('kaboom');
    const handler = vi.fn(() => {
      throw boom;
    });
    const route = defineRoute(handler);
    const res = await route(makeReq(), { params: {} });
    expect(mockRespondError).toHaveBeenCalledWith(boom, expect.any(String));
    expect(res.status).toBe(500);
  });

  it('maps an auth/validation error through respondError', async () => {
    const authErr = new Error('unauthorized');
    mockRequireVerifiedUser.mockRejectedValue(authErr);
    const handler = vi.fn((_req: NextRequest, _ctx: Ctx) => new NextResponse('ok'));
    const route = defineRoute(handler);
    await route(makeReq(), { params: {} });
    expect(mockRespondError).toHaveBeenCalledWith(authErr, expect.any(String));
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs non-AppError exceptions via logger.error before responding', async () => {
    mockRequireVerifiedUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const boom = new Error('something broke');
    const handler = vi.fn(() => { throw boom; });
    const route = defineRoute(handler);
    await route(makeReq(), { params: {} });
    expect(mockLoggerError).toHaveBeenCalledWith('unhandled exception', expect.objectContaining({
      message: 'something broke',
      stack: expect.any(String),
    }));
    expect(mockRespondError).toHaveBeenCalledWith(boom, expect.any(String));
  });

  it('does NOT log AppError exceptions via logger.error (they are operational)', async () => {
    mockRequireVerifiedUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const validationErr = new ValidationError('Bad input');
    const handler = vi.fn(() => { throw validationErr; });
    const route = defineRoute(handler);
    await route(makeReq(), { params: {} });
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockRespondError).toHaveBeenCalledWith(validationErr, expect.any(String));
  });

  it('logs the error message and stack for non-Error thrown values', async () => {
    mockRequireVerifiedUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const handler = vi.fn(() => { throw 'string error'; });
    const route = defineRoute(handler);
    await route(makeReq(), { params: {} });
    expect(mockLoggerError).toHaveBeenCalledWith('unhandled exception', expect.objectContaining({
      message: 'string error',
      stack: undefined,
    }));
  });
});
