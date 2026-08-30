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

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'campaign-resume');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const result = await getPrisma().campaign.updateMany({
      where: { id: parsed.data.id, user_id: user.id },
      data: { status: 'ACTIVE' },
    });

    if (result.count === 0) {
      return respondError(new NotFoundError('Campaign not found.'), requestId);
    }

    return respondOk(null, requestId, 'Campaign resumed.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
