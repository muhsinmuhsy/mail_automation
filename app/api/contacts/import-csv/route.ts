import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { createContactSchema } from '@/lib/validation/contact';
import { validateFieldName, LIMITS } from '@/lib/validation/merge-field-names';
import { ValidationError } from '@/lib/errors';

/**
 * CSV import (Path C, Phase 4).
 * See docs/CUSTOM_MERGE_FIELDS.md §4 Phase 4, §11.1 (unknown-column prompt),
 * §11.14 (resource limits), §11.20 (batch + file-size), §11.27 (import session ID).
 *
 * - Built-in headers (`name`, `email`, `company`, `job_title`, `notes`) map to columns.
 * - Any other header maps to a custom field by `name` token if one exists.
 * - Unknown columns trigger an explicit "Create & Import" prompt: the server
 *   returns the unknown columns; the client re-POSTs with `create_unknown_fields=true`
 *   to authorize creation.
 * - Resource limits (column count, row count, file size) are enforced before processing.
 * - Each import gets a session ID for idempotent retry (§11.27).
 */

const BUILTIN_HEADERS = ['name', 'email', 'company', 'job_title', 'notes'] as const;

const _POST = defineRoute(async (req, ctx) => {
  const formData = await req.formData();
  const file = formData.get('csv');
  if (!file || !(file instanceof File)) {
    return respondError(new ValidationError('CSV file is required.'), ctx.requestId);
  }

  // File-size limit (§11.20).
  if (file.size > LIMITS.MAX_CSV_FILE_SIZE_BYTES) {
    return respondError(
      new ValidationError(
        `CSV file is too large. Maximum size is ${LIMITS.MAX_CSV_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
      ),
      ctx.requestId
    );
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return respondOk(
      { imported: 0, duplicate: 0, invalid: 0, skipped: 0, failed: 0, failedRows: [] as Array<{ row: number; email: string; errors: string[] }> },
      ctx.requestId,
      'No contacts to import.'
    );
  }

  // Resource limits (§11.14).
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (header.length > LIMITS.MAX_CSV_COLUMNS) {
    return respondError(
      new ValidationError(
        `CSV has too many columns (${header.length}). Maximum is ${LIMITS.MAX_CSV_COLUMNS}.`
      ),
      ctx.requestId
    );
  }
  const rowCount = lines.length - 1;
  if (rowCount > LIMITS.MAX_CSV_ROWS) {
    return respondError(
      new ValidationError(
        `CSV has too many rows (${rowCount}). Maximum is ${LIMITS.MAX_CSV_ROWS}.`
      ),
      ctx.requestId
    );
  }

  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const companyIdx = header.indexOf('company');
  const jobTitleIdx = header.indexOf('job_title');
  const notesIdx = header.indexOf('notes');

  if (nameIdx === -1 || emailIdx === -1) {
    return respondError(new ValidationError('CSV must contain name and email columns.'), ctx.requestId);
  }

  // Fetch the user's existing custom field definitions.
  const existingFields = await getPrisma().contactField.findMany({
    where: { user_id: ctx.user.id },
    select: { id: true, name: true, field_type: true },
  });
  const existingFieldNames = new Set(existingFields.map((f) => f.name));

  // Classify non-built-in headers.
  const customHeaderIndexes: Array<{ header: string; index: number }> = [];
  const unknownHeaders: string[] = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (BUILTIN_HEADERS.includes(h as typeof BUILTIN_HEADERS[number])) continue;
    if (existingFieldNames.has(h)) {
      customHeaderIndexes.push({ header: h, index: i });
    } else {
      unknownHeaders.push(h);
    }
  }

  // Unknown-column prompt (§11.1): if there are unknown columns and the
  // client hasn't authorized creation, return them for a confirmation dialog.
  const createUnknown = formData.get('create_unknown_fields') === 'true';
  if (unknownHeaders.length > 0 && !createUnknown) {
    return respondOk(
      {
        imported: 0,
        duplicate: 0,
        invalid: 0,
        skipped: 0,
        failed: 0,
        failedRows: [],
        unknownColumns: unknownHeaders,
        requiresConfirmation: true,
      },
      ctx.requestId,
      'Unknown columns detected. Confirm to create fields and import.'
    );
  }

  // Validate unknown column names before creating fields.
  if (createUnknown && unknownHeaders.length > 0) {
    for (const h of unknownHeaders) {
      const error = validateFieldName(h);
      if (error) {
        return respondError(
          new ValidationError(`Column "${h}" is not a valid field token: ${error}`),
          ctx.requestId
        );
      }
    }
    // Resource limit: would creating these exceed the cap?
    const currentCount = existingFields.length;
    if (currentCount + unknownHeaders.length > LIMITS.MAX_CUSTOM_FIELDS_PER_USER) {
      return respondError(
        new ValidationError(
          `Creating ${unknownHeaders.length} new fields would exceed the limit of ${LIMITS.MAX_CUSTOM_FIELDS_PER_USER} custom fields.`
        ),
        ctx.requestId
      );
    }
  }

  // Generate or accept an import session ID (§11.27).
  const importSessionId =
    (formData.get('import_session_id') as string | null) ?? globalThis.crypto.randomUUID();

  // Create unknown fields (as text) if authorized.
  let fieldByName = new Map(existingFields.map((f) => [f.name, f]));
  if (createUnknown && unknownHeaders.length > 0) {
    const created = await getPrisma().contactField.createMany({
      data: unknownHeaders.map((name, i) => ({
        user_id: ctx.user.id,
        name,
        label: name,
        field_type: 'text' as const,
        sort_order: existingFields.length + i,
      })),
      skipDuplicates: true,
    });
    void created;
    // Re-fetch to get the newly created field IDs.
    const refreshed = await getPrisma().contactField.findMany({
      where: { user_id: ctx.user.id },
      select: { id: true, name: true, field_type: true },
    });
    fieldByName = new Map(refreshed.map((f) => [f.name, f]));
    for (const h of unknownHeaders) {
      customHeaderIndexes.push({ header: h, index: header.indexOf(h) });
    }
  }

  let importedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  const skippedCount = 0;
  const failedRows: Array<{ row: number; email: string; errors: string[] }> = [];

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
      failedRows.push({
        row: i,
        email,
        errors: parsed.error.errors.map((e) => e.message),
      });
      continue;
    }

    // Idempotent retry (§11.27): skip if already imported in this session.
    const existing = await getPrisma().contact.findFirst({
      where: { user_id: ctx.user.id, email: parsed.data.email, import_session_id: importSessionId },
      select: { id: true },
    });
    if (existing) {
      duplicateCount++;
      continue;
    }

    // Collect custom field values from the row.
    const customValues: Array<{ field_id: string; value: string }> = [];
    for (const { header: h, index } of customHeaderIndexes) {
      const rawValue = cols[index]?.trim() ?? '';
      if (!rawValue) continue;
      const field = fieldByName.get(h);
      if (!field) continue;
      if (rawValue.length > LIMITS.MAX_FIELD_VALUE_LENGTH) {
        invalidCount++;
        failedRows.push({
          row: i,
          email,
          errors: [`Value for "${h}" exceeds ${LIMITS.MAX_FIELD_VALUE_LENGTH} characters.`],
        });
        continue;
      }
      customValues.push({ field_id: field.id, value: rawValue });
    }

    if (failedRows.some((r) => r.row === i)) continue;

    try {
      const contact = await getPrisma().contact.create({
        data: {
          user_id: ctx.user.id,
          name: parsed.data.name,
          email: parsed.data.email,
          company: parsed.data.company || null,
          job_title: parsed.data.job_title || null,
          notes: parsed.data.notes || null,
          import_session_id: importSessionId,
        },
        select: { id: true },
      });

      if (customValues.length > 0) {
        await getPrisma().contactFieldValue.createMany({
          data: customValues.map((v) => ({
            contact_id: contact.id,
            field_id: v.field_id,
            value: v.value,
          })),
        });
      }

      importedCount++;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        duplicateCount++;
        continue;
      }
      invalidCount++;
      failedRows.push({
        row: i,
        email,
        errors: [(error as Error).message],
      });
    }
  }

  return respondOk(
    {
      imported: importedCount,
      duplicate: duplicateCount,
      invalid: invalidCount,
      skipped: skippedCount,
      failed: failedRows.length,
      failedRows,
      import_session_id: importSessionId,
    },
    ctx.requestId,
    `Contacts imported successfully. ${importedCount} imported, ${duplicateCount} duplicates, ${invalidCount} invalid, ${skippedCount} skipped.`
  );
}, { auth: 'user', rateLimitKey: 'contact-import' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
