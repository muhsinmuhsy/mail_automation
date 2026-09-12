import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { createStorageService } from '@/lib/storage/storage.factory';
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors';

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const attachment = await getPrisma().attachment.findUnique({
    where: { id: parsed.data.id },
  });

  if (!attachment || attachment.deleted_at) {
    return respondError(new NotFoundError('Attachment not found.'), ctx.requestId);
  }

  const stream = await createStorageService(process.env).download(attachment.storage_key);

  return new NextResponse(stream as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${attachment.filename}"`,
    },
  });
}, {
  auth: {
    ownership: async (params) => {
      const r = await getPrisma().attachment.findUnique({
        where: { id: params.id },
        select: { user_id: true, deleted_at: true },
      });
      if (!r || r.deleted_at) throw new NotFoundError('Attachment not found.');
      return r.user_id;
    },
  },
  rateLimitKey: 'attachment-download',
});

export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}

const _DELETE = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const attachment = await getPrisma().attachment.findUnique({
    where: { id: parsed.data.id },
  });

  if (!attachment) {
    return respondError(new NotFoundError('Attachment not found.'), ctx.requestId);
  }

  const campaignCount = await getPrisma().campaign.count({
    where: {
      user_id: ctx.user.id,
      OR: [{ attachment_id: parsed.data.id }, { attachment_ids: { has: parsed.data.id } }],
    },
  });

  if (campaignCount > 0) {
    return respondError(
      new ConflictError(
        `This attachment is used by ${campaignCount} campaign(s) and cannot be deleted. Remove it from those campaigns first.`
      ),
      ctx.requestId
    );
  }

  const pendingJobCount = await getPrisma().emailJob.count({
    where: {
      OR: [{ attachment_id: parsed.data.id }, { attachment_ids: { has: parsed.data.id } }],
      status: { in: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT'] },
    },
  });

  if (pendingJobCount > 0) {
    return respondError(
      new ConflictError(
        `This attachment is used by ${pendingJobCount} pending email job(s) and cannot be deleted. Wait for them to complete or cancel them first.`
      ),
      ctx.requestId
    );
  }

  await createStorageService(process.env).delete(attachment.storage_key);
  await getPrisma().attachment.delete({ where: { id: attachment.id } });

  return respondOk(null, ctx.requestId, 'Attachment deleted.');
}, {
  auth: {
    ownership: async (params) => {
      const r = await getPrisma().attachment.findUnique({
        where: { id: params.id },
        select: { user_id: true, deleted_at: true },
      });
      if (!r || r.deleted_at) throw new NotFoundError('Attachment not found.');
      return r.user_id;
    },
  },
  rateLimitKey: 'attachment-delete',
});


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}
