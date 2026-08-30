import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const { sessionUser } = await requireAdmin();

    const rateLimitResult = await checkApiRateLimit(request, sessionUser.id, 'admin-campaign-pause');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const campaign = await getPrisma().campaign.findUnique({ where: { id: parsed.data.id } });
    if (!campaign) {
      return respondError(new NotFoundError('Campaign not found.'), requestId);
    }

    await getPrisma().campaign.update({
      where: { id: parsed.data.id },
      data: { status: 'PAUSED' },
    });

    return respondOk(null, requestId, 'Campaign paused.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
