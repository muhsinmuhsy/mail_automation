import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { createResumeSchema } from '@/lib/validation/resume';
import { createStorageService } from '@/lib/storage/storage.factory';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function isPdf(file: File, bytes: Uint8Array): boolean {
  return file.name.toLowerCase().endsWith('.pdf') &&
    file.type === 'application/pdf' &&
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const resumes = await prisma.resume.findMany({
      where: { user_id: sessionResult.session.user.id, deleted_at: null },
      select: { id: true, filename: true, is_default: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(resumes)), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'resume-upload');
    if (rateLimitResult) return rateLimitResult;

    const formData = await request.formData();
    const candidate = formData.get('file');
    if (!(candidate instanceof File)) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Please select a file.'), { status: 400 }), requestId);
    }
    const file = candidate;
    if (file.size === 0 || file.size > MAX_RESUME_BYTES) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Resume must be a PDF no larger than 5 MB.'), { status: 400 }), requestId);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(file, bytes)) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Resume must be a valid PDF file.'), { status: 400 }), requestId);
    }
    const parsed = createResumeSchema.safeParse({ filename: file.name, mimeType: file.type, sizeBytes: file.size });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Resume metadata is invalid.'), { status: 400 }), requestId);
    }
    const storageKey = `resumes/${session.user.id}/${crypto.randomUUID()}.pdf`;
    const storage = createStorageService(process.env);
    await storage.upload({ key: storageKey, body: bytes, contentType: 'application/pdf', contentLength: bytes.byteLength, metadata: { userId: session.user.id, originalFilename: file.name } });
    let resume;
    try {
      resume = await prisma.resume.create({
        data: { user_id: session.user.id, filename: parsed.data.filename, storage_key: storageKey, size_bytes: parsed.data.sizeBytes },
        select: { id: true, filename: true, size_bytes: true, is_default: true, created_at: true },
      });
    } catch (error) {
      await storage.delete(storageKey).catch(() => undefined);
      throw error;
    }

    return withRequestId(NextResponse.json(success(resume, 'Resume uploaded successfully.'), { status: 201 }), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
