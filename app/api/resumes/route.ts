import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createResumeSchema } from '@/lib/validation/resume';
import { createStorageService } from '@/lib/storage/storage.factory';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { ValidationError } from '@/lib/errors';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function isPdf(file: File, bytes: Uint8Array): boolean {
  return (
    file.name.toLowerCase().endsWith('.pdf') &&
    file.type === 'application/pdf' &&
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  );
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();
    const { page, limit, search } = parseListQuery(request, { search: true });

    const where = {
      user_id: user.id,
      deleted_at: null,
      ...(search ? { filename: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [resumes, total] = await Promise.all([
      getPrisma().resume.findMany({
        where,
        select: { id: true, filename: true, is_default: true, created_at: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrisma().resume.count({ where }),
    ]);

    return respondList(resumes, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'resume-upload');
    if (rateLimitResult) return rateLimitResult;

    const formData = await request.formData();
    const candidate = formData.get('file');
    if (!(candidate instanceof File)) {
      return respondError(new ValidationError('Please select a file.'), requestId);
    }
    const file = candidate;
    if (file.size === 0 || file.size > MAX_RESUME_BYTES) {
      return respondError(new ValidationError('Resume must be a PDF no larger than 5 MB.'), requestId);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(file, bytes)) {
      return respondError(new ValidationError('Resume must be a valid PDF file.'), requestId);
    }
    const parsed = createResumeSchema.safeParse({ filename: file.name, mimeType: file.type, sizeBytes: file.size });
    if (!parsed.success) {
      return respondError(new ValidationError('Resume metadata is invalid.'), requestId);
    }
    const storageKey = `resumes/${user.id}/${crypto.randomUUID()}.pdf`;
    const storage = createStorageService(process.env);
    await storage.upload({
      key: storageKey,
      body: bytes,
      contentType: 'application/pdf',
      contentLength: bytes.byteLength,
      metadata: { userId: user.id, originalFilename: file.name },
    });
    let resume;
    try {
      resume = await getPrisma().resume.create({
        data: {
          user_id: user.id,
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

    return respondOk(resume, requestId, 'Resume uploaded successfully.', 201);
  } catch (err) {
    return respondError(err, requestId);
  }
}
