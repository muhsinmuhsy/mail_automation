import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'resume-default');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const resume = await getPrisma().resume.findFirst({
      where: { id: parsed.data.id, user_id: user.id, deleted_at: null },
    });
    if (!resume) {
      return respondError(new NotFoundError('Resume not found.'), requestId);
    }

    await getPrisma().$transaction([
      getPrisma().resume.updateMany({
        where: { user_id: user.id, deleted_at: null },
        data: { is_default: false },
      }),
      getPrisma().resume.update({ where: { id: resume.id }, data: { is_default: true } }),
    ]);

    return respondOk(null, requestId, 'Default resume set.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
