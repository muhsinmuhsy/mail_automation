import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createContactSchema } from '@/lib/validation/contact';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'contact-import');
    if (rateLimitResult) return rateLimitResult;

    const formData = await request.formData();
    const file = formData.get('csv');
    if (!file || !(file instanceof File)) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'CSV file is required.'), { status: 400 }), requestId);
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length <= 1) {
      return withRequestId(NextResponse.json(success({ imported: 0, duplicate: 0, invalid: 0, skipped: 0 }, 'No contacts to import.')), requestId);
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const emailIdx = header.indexOf('email');
    const companyIdx = header.indexOf('company');
    const jobTitleIdx = header.indexOf('job_title');
    const notesIdx = header.indexOf('notes');

    if (nameIdx === -1 || emailIdx === -1) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'CSV must contain name and email columns.'), { status: 400 }), requestId);
    }

    let importedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    const skippedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const name = cols[nameIdx] || '';
      const email = cols[emailIdx] || '';
      const company = companyIdx >= 0 && cols[companyIdx] ? cols[companyIdx] : undefined;
      const job_title = jobTitleIdx >= 0 && cols[jobTitleIdx] ? cols[jobTitleIdx] : undefined;
      const notes = notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx] : undefined;

      const parsed = createContactSchema.safeParse({ name, email, company, job_title, notes });
      if (!parsed.success) {
        invalidCount++;
        continue;
      }

      const existing = await prisma.contact.findFirst({
        where: { user_id: session.user.id, email: parsed.data.email },
      });

      if (existing) {
        duplicateCount++;
        continue;
      }

      await prisma.contact.create({
        data: {
          user_id: session.user.id,
          name: parsed.data.name,
          email: parsed.data.email,
          company: parsed.data.company || null,
          job_title: parsed.data.job_title || null,
          notes: parsed.data.notes || null,
        },
      });

      importedCount++;
    }

    return withRequestId(
      NextResponse.json(
        success({ imported: importedCount, duplicate: duplicateCount, invalid: invalidCount, skipped: skippedCount }, `Contacts imported successfully. ${importedCount} imported, ${duplicateCount} duplicates, ${invalidCount} invalid, ${skippedCount} skipped.`)
      ),
      requestId
    );
  } catch (err) {
    console.error('CSV import error:', err);
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
