import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const campaign = await getPrisma().campaign.findFirst({
      where: { id: parsed.data.id, user_id: user.id },
    });

    if (!campaign) {
      return respondError(new NotFoundError('Campaign not found.'), requestId);
    }

    return respondOk(campaign, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}
