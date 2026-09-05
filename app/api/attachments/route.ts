import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createAttachmentSchema } from '@/lib/validation/attachment';
import { createStorageService } from '@/lib/storage/storage.factory';
import { ValidationError } from '@/lib/errors';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function isPdf(file: File, bytes: Uint8Array): boolean {
  return (
    file.name.toLowerCase().endsWith('.pdf') &&
    file.type === 'application/pdf' &&
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  );
}

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const where = {
    user_id: ctx.user.id,
    deleted_at: null,
    ...(search ? { filename: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [attachments, total] = await Promise.all([
    getPrisma().attachment.findMany({
      where,
      select: { id: true, filename: true, is_default: true, created_at: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().attachment.count({ where }),
  ]);

  return respondList(attachments, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const formData = await req.formData();
  const candidate = formData.get('file');
  if (!(candidate instanceof File)) {
    return respondError(new ValidationError('Please select a file.'), ctx.requestId);
  }
  const file = candidate;
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return respondError(new ValidationError('Attachment must be a PDF no larger than 5 MB.'), ctx.requestId);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(file, bytes)) {
    return respondError(new ValidationError('Attachment must be a valid PDF file.'), ctx.requestId);
  }
  const parsed = createAttachmentSchema.safeParse({ filename: file.name, mimeType: file.type, sizeBytes: file.size });
  if (!parsed.success) {
    return respondError(new ValidationError('Attachment metadata is invalid.'), ctx.requestId);
  }
  const storageKey = `attachments/${ctx.user.id}/${crypto.randomUUID()}.pdf`;
  const storage = createStorageService(process.env);
  await storage.upload({
    key: storageKey,
    body: bytes,
    contentType: 'application/pdf',
    contentLength: bytes.byteLength,
    metadata: { userId: ctx.user.id, originalFilename: file.name },
  });
  let attachment;
  try {
    attachment = await getPrisma().attachment.create({
      data: {
        user_id: ctx.user.id,
        filename: parsed.data.filename,
        storage_key: storageKey,
        size_bytes: parsed.data.sizeBytes,
      },
      select: { id: true, filename: true, size_bytes: true, is_default: true, created_at: true },
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  return respondOk(attachment, ctx.requestId, 'Attachment uploaded successfully.', 201);
}, { auth: 'user', rateLimitKey: 'attachment-upload' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
