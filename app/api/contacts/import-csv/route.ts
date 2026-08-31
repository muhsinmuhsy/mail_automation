import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { createContactSchema } from '@/lib/validation/contact';
import { ValidationError } from '@/lib/errors';

const _POST = defineRoute(async (req, ctx) => {
  const formData = await req.formData();
  const file = formData.get('csv');
  if (!file || !(file instanceof File)) {
    return respondError(new ValidationError('CSV file is required.'), ctx.requestId);
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return respondOk(
      { imported: 0, duplicate: 0, invalid: 0, skipped: 0 },
      ctx.requestId,
      'No contacts to import.'
    );
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const companyIdx = header.indexOf('company');
  const jobTitleIdx = header.indexOf('job_title');
  const notesIdx = header.indexOf('notes');

  if (nameIdx === -1 || emailIdx === -1) {
    return respondError(new ValidationError('CSV must contain name and email columns.'), ctx.requestId);
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

    const existing = await getPrisma().contact.findFirst({
      where: { user_id: ctx.user.id, email: parsed.data.email },
    });

    if (existing) {
      duplicateCount++;
      continue;
    }

    await getPrisma().contact.create({
      data: {
        user_id: ctx.user.id,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company || null,
        job_title: parsed.data.job_title || null,
        notes: parsed.data.notes || null,
      },
    });

    importedCount++;
  }

  return respondOk(
    { imported: importedCount, duplicate: duplicateCount, invalid: invalidCount, skipped: skippedCount },
    ctx.requestId,
    `Contacts imported successfully. ${importedCount} imported, ${duplicateCount} duplicates, ${invalidCount} invalid, ${skippedCount} skipped.`
  );
}, { auth: 'user', rateLimitKey: 'contact-import' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
