import { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { respondError } from '@/lib/api/respond';
import { requireVerifiedUser } from '@/lib/api/session';
import { enforceRateLimit } from '@/lib/rate-limit/middleware';
import {
  requireAdmin,
  requireOwnership,
  type SessionUser,
} from '@/lib/auth/guards';

export type RouteParams = Record<string, string> | Promise<Record<string, string>>;

export type RouteContext = {
  user: SessionUser;
  params: Record<string, string>;
  req: NextRequest;
};

export type RouteAuth =
  | 'user'
  | 'admin'
  | { ownership: (params: Record<string, string>) => Promise<string> | string };

export type RouteOptions = {
  auth?: RouteAuth;
  rateLimitKey?: string;
  /** When true (default), user routes also require a verified email. */
  verified?: boolean;
};

export type RouteHandler = (
  req: NextRequest,
  ctx: RouteContext
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with:
 *  - authentication/authorization (user, admin, or resource-owner),
 *  - optional email-verification enforcement for user routes,
 *  - per-endpoint rate limiting,
 *  - centralized error handling that converts AppError/unknown into a stable
 *    JSON error body.
 *
 * The handler receives the resolved params (handling Next 15+ async params)
 * and the authenticated user.
 */
export function defineRoute(handler: RouteHandler, options: RouteOptions = {}) {
  return async (req: NextRequest, ctx: { params: RouteParams }) => {
    try {
      const params =
        ctx.params instanceof Promise ? await ctx.params : ctx.params;

      let user: SessionUser;
      const auth = options.auth ?? 'user';

      if (auth === 'admin') {
        const result = await requireAdmin();
        user = result.sessionUser;
      } else if (auth === 'user') {
        if (options.verified === false) {
          const { requireUser } = await import('@/lib/auth/guards');
          user = await requireUser();
        } else {
          user = (await requireVerifiedUser()) as SessionUser;
        }
      } else {
        const ownerId = await auth.ownership(params);
        const result = await requireOwnership(ownerId);
        user = result.sessionUser;
      }

      if (options.rateLimitKey) {
        await enforceRateLimit(user.id, options.rateLimitKey);
      }

      return await handler(req, { user, params, req });
    } catch (err) {
      return respondError(err);
    }
  };
}
