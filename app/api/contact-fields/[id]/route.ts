import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateContactFieldSchema } from '@/lib/validation/contact-field';
import { coerceValues } from '@/lib/validation/contact';
import { VARIABLE_PATTERN } from '@/lib/email/template';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  fromPrismaError,
} from '@/lib/errors';

/**
 * Per-field operations (Path C, Phase 4).
 * See docs/CUSTOM_MERGE_FIELDS.md §4 Phase 4, §11.10 (authorization),
 * §11.11 (transactional delete), §11.24 (optimistic concurrency).
 *
 * Every query is scoped by `{ id, user_id: ctx.user.id }` — never by `id` alone.
 */

const _PATCH = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();
  const updateParsed = updateContactFieldSchema.safeParse(body);
  if (!updateParsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const fieldId = parsed.data.id;
  const expectedVersion = updateParsed.data.version;

  try {
    // If the type is changing, coerce existing values inside a transaction.
    if (updateParsed.data.field_type) {
      const targetType = updateParsed.data.field_type;
      const result = await getPrisma().$transaction(async (tx) => {
        // Optimistic concurrency: check version in the where clause.
        const existing = await tx.contactField.findFirst({
          where: { id: fieldId, user_id: ctx.user.id, version: expectedVersion },
          select: { id: true, field_type: true, version: true },
        });
        if (!existing) {
          // Either not found, not owned, or version mismatch.
          const any = await tx.contactField.findFirst({
            where: { id: fieldId, user_id: ctx.user.id },
            select: { version: true },
          });
          if (!any) throw new NotFoundError('Field not found.');
          throw new ConflictError(
            'This field was modified by another request. Please refresh and retry.'
          );
        }

        if (existing.field_type !== targetType) {
          // Coerce existing values to the new type.
          const values = await tx.contactFieldValue.findMany({
            where: { field_id: fieldId },
            select: { id: true, value: true },
          });
          const coercion = coerceValues(
            values,
            targetType
          );
          if (!coercion.ok) {
            throw new ValidationError(
              `Cannot change field type: ${coercion.errors.join(' ')}`
            );
          }
          for (const update of coercion.updates) {
            await tx.contactFieldValue.update({
              where: { id: update.id },
              data: { value: update.value },
            });
          }
        }

        // Increment version on PATCH (§11.24).
        const { version: _, ...patchData } = updateParsed.data;
        void _;
        const updated = await tx.contactField.update({
          where: { id: fieldId },
          data: { ...patchData, version: { increment: 1 } },
        });
        return updated;
      });
      return respondOk(result, ctx.requestId, 'Field updated.');
    }

    // No type change — simple update with version check.
    const result = await getPrisma().contactField.updateMany({
      where: { id: fieldId, user_id: ctx.user.id, version: expectedVersion },
      data: {
        ...(updateParsed.data.label !== undefined
          ? { label: updateParsed.data.label }
          : {}),
        ...(updateParsed.data.sort_order !== undefined
          ? { sort_order: updateParsed.data.sort_order }
          : {}),
        ...(updateParsed.data.is_required !== undefined
          ? { is_required: updateParsed.data.is_required }
          : {}),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const any = await getPrisma().contactField.findFirst({
        where: { id: fieldId, user_id: ctx.user.id },
        select: { version: true },
      });
      if (!any) return respondError(new NotFoundError('Field not found.'), ctx.requestId);
      return respondError(
        new ConflictError(
          'This field was modified by another request. Please refresh and retry.'
        ),
        ctx.requestId
      );
    }

    const updated = await getPrisma().contactField.findUniqueOrThrow({
      where: { id: fieldId },
    });
    return respondOk(updated, ctx.requestId, 'Field updated.');
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError || error instanceof ValidationError) {
      return respondError(error, ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, {
  auth: 'user',
  rateLimitKey: 'contact-field-update',
});

const _DELETE = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const fieldId = parsed.data.id;
  const { searchParams } = new URL(req.url);
  const expectedVersion = searchParams.get('version');
  if (!expectedVersion) {
    return respondError(
      new ValidationError('Version query parameter is required for delete.'),
      ctx.requestId
    );
  }
  const versionNum = Number(expectedVersion);
  if (Number.isNaN(versionNum)) {
    return respondError(new ValidationError('Invalid version.'), ctx.requestId);
  }

  try {
    // Single transaction (§11.11): verify ownership → delete values → delete field.
    const result = await getPrisma().$transaction(async (tx) => {
      // Verify ownership + version (§11.24). Version is checked but NOT incremented.
      const field = await tx.contactField.findFirst({
        where: { id: fieldId, user_id: ctx.user.id, version: versionNum },
        select: { id: true, name: true },
      });
      if (!field) {
        const any = await tx.contactField.findFirst({
          where: { id: fieldId, user_id: ctx.user.id },
          select: { version: true },
        });
        if (!any) throw new NotFoundError('Field not found.');
        throw new ConflictError(
          'This field was modified by another request. Please refresh and retry.'
        );
      }

      await tx.contactFieldValue.deleteMany({ where: { field_id: fieldId } });
      await tx.contactField.delete({ where: { id: fieldId } });
      return field;
    });
    return respondOk(
      { id: result.id, name: result.name },
      ctx.requestId,
      'Field deleted.'
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return respondError(error, ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, {
  auth: 'user',
  rateLimitKey: 'contact-field-delete',
});

/**
 * GET usage counts for the delete confirmation dialog (§11.19, Risk 6).
 * Returns template_usage_count, contact_value_count, affected_template_names.
 */
const _GET = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const fieldId = parsed.data.id;
  const field = await getPrisma().contactField.findFirst({
    where: { id: fieldId, user_id: ctx.user.id },
    select: { id: true, name: true, label: true },
  });
  if (!field) {
    return respondError(new NotFoundError('Field not found.'), ctx.requestId);
  }

  // Count templates whose subject or body contains the token, using the same
  // VARIABLE_PATTERN regex as the substitution engine (§11.19).
  const token = field.name;
  const templates = await getPrisma().template.findMany({
    where: { user_id: ctx.user.id },
    select: { id: true, name: true, subject: true, body: true, body_html: true, body_text: true },
  });

  const affectedTemplateNames: string[] = [];
  for (const t of templates) {
    const tokens = new Set<string>([
      ...[...t.subject.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase()),
      ...[...t.body.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase()),
      ...(t.body_html ? [...t.body_html.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase()) : []),
      ...(t.body_text ? [...t.body_text.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase()) : []),
    ]);
    if (tokens.has(token)) {
      affectedTemplateNames.push(t.name);
    }
  }

  const contactValueCount = await getPrisma().contactFieldValue.count({
    where: { field_id: fieldId },
  });

  const cappedNames = affectedTemplateNames.slice(0, 10);
  const moreCount = affectedTemplateNames.length - cappedNames.length;

  return respondOk(
    {
      template_usage_count: affectedTemplateNames.length,
      contact_value_count: contactValueCount,
      affected_template_names: cappedNames,
      ...(moreCount > 0 ? { more_templates: moreCount } : {}),
    },
    ctx.requestId
  );
}, { auth: 'user' });


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
