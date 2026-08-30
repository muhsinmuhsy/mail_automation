import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { respondError, respondOk } from '@/lib/api/respond';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const { sessionUser } = await requireAdmin();

    const rateLimitResult = await checkApiRateLimit(request, sessionUser.id, 'admin-user-enable');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const targetUser = await getPrisma().user.findUnique({ where: { id: parsed.data.id } });
    if (!targetUser) {
      return respondError(new NotFoundError('User not found.'), requestId);
    }

    await getPrisma().user.update({
      where: { id: parsed.data.id },
      data: { is_active: true },
    });

    return respondOk(null, requestId, 'User enabled.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
