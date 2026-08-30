import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { createStorageService } from '@/lib/storage/storage.factory';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'resume-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const resume = await getPrisma().resume.findFirst({
      where: { id: parsed.data.id, user_id: user.id },
    });

    if (!resume) {
      return respondError(new NotFoundError('Resume not found.'), requestId);
    }

    const pendingJobCount = await getPrisma().emailJob.count({
      where: {
        resume_id: parsed.data.id,
        status: { in: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT'] },
      },
    });

    if (pendingJobCount > 0) {
      await getPrisma().resume.update({
        where: { id: resume.id },
        data: { deleted_at: new Date(), is_default: false },
      });
      return respondOk(null, requestId, 'Resume removed and retained for pending emails.');
    }

    await createStorageService(process.env).delete(resume.storage_key);
    await getPrisma().resume.delete({ where: { id: resume.id } });

    return respondOk(null, requestId, 'Resume deleted.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
