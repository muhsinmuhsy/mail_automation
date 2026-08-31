import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { createStorageService } from '@/lib/storage/storage.factory';
import { NotFoundError, ValidationError } from '@/lib/errors';

const _DELETE = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const resume = await getPrisma().resume.findUnique({
    where: { id: parsed.data.id },
  });

  if (!resume) {
    return respondError(new NotFoundError('Resume not found.'), ctx.requestId);
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
    return respondOk(null, ctx.requestId, 'Resume removed and retained for pending emails.');
  }

  await createStorageService(process.env).delete(resume.storage_key);
  await getPrisma().resume.delete({ where: { id: resume.id } });

  return respondOk(null, ctx.requestId, 'Resume deleted.');
}, {
  auth: {
    ownership: async (params) => {
      const r = await getPrisma().resume.findUnique({
        where: { id: params.id },
        select: { user_id: true, deleted_at: true },
      });
      if (!r || r.deleted_at) throw new NotFoundError('Resume not found.');
      return r.user_id;
    },
  },
  rateLimitKey: 'resume-delete',
});


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}
