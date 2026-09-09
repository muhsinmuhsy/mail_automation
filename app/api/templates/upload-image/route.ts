import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { createStorageService } from '@/lib/storage/storage.factory';
import { buildPublicUrl } from '@/lib/storage/public-url';
import { ValidationError } from '@/lib/errors';
import {
  MAX_IMAGE_BYTES,
  imageContentType,
  validImageFormat,
  sanitizeFilename,
  fileExtension,
} from '@/lib/attachments/image-types';

/**
 * POST /api/templates/upload-image
 *
 * Upload an image for use in the visual email editor. Stores in B2 public
 * bucket and returns a stable HTTPS URL suitable for long-lived email content.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §12. Hardening:
 * - Authentication required (auth: 'user').
 * - Image content types only (png, jpeg, gif, webp) — validated by magic bytes.
 * - Max file size 5 MB — rejected before streaming to B2.
 * - Server-generated safe object keys (templates/{userId}/{uuid}.{ext}).
 * - Rejects executable types even with spoofed content type.
 * - Filename sanitized before storage.
 */
const _POST = defineRoute(async (req, ctx) => {
  const formData = await req.formData();
  const candidate = formData.get('file');

  if (!(candidate instanceof File)) {
    return respondError(
      new ValidationError('Please select an image file.'),
      ctx.requestId
    );
  }

  const file = candidate;

  if (file.size === 0) {
    return respondError(
      new ValidationError('Image file must not be empty.'),
      ctx.requestId
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return respondError(
      new ValidationError('Image must be no larger than 5 MB.'),
      ctx.requestId
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!validImageFormat(file.name, bytes)) {
    return respondError(
      new ValidationError('Unsupported image type or invalid file contents. Allowed: JPG, PNG, GIF, WebP.'),
      ctx.requestId
    );
  }

  const ext = fileExtension(file.name);
  const storageKey = `templates/${ctx.user.id}/${crypto.randomUUID()}.${ext}`;
  const contentType = imageContentType(file.name);
  const safeFilename = sanitizeFilename(file.name);

  const storage = createStorageService(process.env);
  await storage.upload({
    key: storageKey,
    body: bytes,
    contentType,
    contentLength: bytes.byteLength,
    metadata: { userId: ctx.user.id, originalFilename: safeFilename },
  });

  let attachment;
  try {
    attachment = await getPrisma().attachment.create({
      data: {
        user_id: ctx.user.id,
        filename: safeFilename,
        storage_key: storageKey,
        size_bytes: file.size,
      },
      select: {
        id: true,
        filename: true,
        storage_key: true,
        size_bytes: true,
        created_at: true,
      },
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  const publicUrl = buildPublicUrl(storageKey, process.env);

  return respondOk(
    {
      id: attachment.id,
      url: publicUrl,
      filename: attachment.filename,
      size_bytes: attachment.size_bytes,
    },
    ctx.requestId,
    'Image uploaded successfully.',
    201
  );
}, { auth: 'user', rateLimitKey: 'template-image-upload' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
