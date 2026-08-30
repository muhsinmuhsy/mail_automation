import { NextRequest, NextResponse } from 'next/server';
import { buildErrorResponse } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit/middleware';
import {
  requireUser,
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
};

export type RouteHandler = (
  req: NextRequest,
  ctx: RouteContext
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with:
 *  - authentication/authorization (user, admin, or resource-owner),
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
        user = await requireUser();
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
      const { status, body } = buildErrorResponse(err);
      return NextResponse.json(body, { status });
    }
  };
}
