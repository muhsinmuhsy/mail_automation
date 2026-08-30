import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { createContactSchema } from '@/lib/validation/contact';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'contact-import');
    if (rateLimitResult) return rateLimitResult;

    const formData = await request.formData();
    const file = formData.get('csv');
    if (!file || !(file instanceof File)) {
      return respondError(new ValidationError('CSV file is required.'), requestId);
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length <= 1) {
      return respondOk(
        { imported: 0, duplicate: 0, invalid: 0, skipped: 0 },
        requestId,
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
      return respondError(new ValidationError('CSV must contain name and email columns.'), requestId);
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
        where: { user_id: user.id, email: parsed.data.email },
      });

      if (existing) {
        duplicateCount++;
        continue;
      }

      await getPrisma().contact.create({
        data: {
          user_id: user.id,
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
      requestId,
      `Contacts imported successfully. ${importedCount} imported, ${duplicateCount} duplicates, ${invalidCount} invalid, ${skippedCount} skipped.`
    );
  } catch (err) {
    return respondError(err, requestId);
  }
}
