import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { idParamSchema } from '@/lib/validation/common';
import { adminUpdateUserSchema } from '@/lib/validation/admin';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { respondError, respondOk } from '@/lib/api/respond';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const user = await getPrisma().user.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
    });

    if (!user) {
      return respondError(new NotFoundError('User not found.'), requestId);
    }

    return respondOk(user, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  try {
    const { sessionUser } = await requireAdmin();

    const rateLimitResult = await checkApiRateLimit(request, sessionUser.id, 'admin-user-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const body = await request.json();
    const updateParsed = adminUpdateUserSchema.safeParse(body);
    if (!updateParsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const targetUser = await getPrisma().user.findUnique({ where: { id: parsed.data.id } });
    if (!targetUser) {
      return respondError(new NotFoundError('User not found.'), requestId);
    }

    if (targetUser.role === 'ADMIN' && targetUser.id === sessionUser.id && updateParsed.data.is_active === false) {
      return respondError(new ForbiddenError('Cannot disable the last active admin.'), requestId);
    }

    const updated = await getPrisma().user.update({
      where: { id: parsed.data.id },
      data: {
        is_active: updateParsed.data.is_active ?? targetUser.is_active,
        daily_email_limit_override: updateParsed.data.daily_email_limit_override ?? targetUser.daily_email_limit_override,
      },
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true },
    });

    return respondOk(updated, requestId, 'User updated.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
