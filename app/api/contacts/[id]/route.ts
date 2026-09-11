import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import {
  buildUpdateContactSchema,
  splitContactPayload,
  type ContactFieldDefinition,
} from '@/lib/validation/contact';
import { NotFoundError, ValidationError, fromPrismaError } from '@/lib/errors';

/**
 * Per-contact operations (Path C, Phase 4).
 * PATCH updates built-in columns and upserts/deletes custom field values in a
 * transaction. DELETE removes the contact (cascade-deletes its custom values).
 */

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const contact = await getPrisma().contact.findUnique({
    where: { id: parsed.data.id, user_id: ctx.user.id },
    select: { id: true, name: true, email: true, created_at: true, updated_at: true },
  });

  if (!contact) {
    return respondError(new NotFoundError('Contact not found.'), ctx.requestId);
  }

  const fieldDefs = await getPrisma().contactField.findMany({
    where: { user_id: ctx.user.id },
    orderBy: { sort_order: 'asc' },
    select: { id: true, name: true, label: true, field_type: true, is_required: true },
  });

  const fieldValues = await getPrisma().contactFieldValue.findMany({
    where: { contact_id: parsed.data.id },
    select: { field_id: true, value: true },
  });

  const fieldDefById = new Map(fieldDefs.map((f) => [f.id, f]));
  const custom_fields: Record<string, string | null> = {};
  for (const v of fieldValues) {
    const def = fieldDefById.get(v.field_id);
    if (def) custom_fields[def.name] = v.value;
  }

  return respondOk({ ...contact, custom_fields }, ctx.requestId);
}, { auth: 'user' });

const _PATCH = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();

  // Fetch the user's field definitions to build the dynamic schema.
  const fieldDefs = await getPrisma().contactField.findMany({
    where: { user_id: ctx.user.id },
    select: { id: true, name: true, field_type: true, is_required: true },
  });
  const schema = buildUpdateContactSchema(fieldDefs as ContactFieldDefinition[]);
  const updateParsed = schema.safeParse(body);
  if (!updateParsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const { builtins, custom } = splitContactPayload(
    updateParsed.data as Record<string, unknown>,
    fieldDefs as ContactFieldDefinition[]
  );
  const customEntries = Object.entries(custom);
  const fieldByName = new Map(fieldDefs.map((f) => [f.name, f]));
  const contactId = parsed.data.id;

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      // Update built-in columns. updateMany returns { count }; 0 means not found.
      const updateResult = await tx.contact.updateMany({
        where: { id: contactId, user_id: ctx.user.id },
        data: builtins,
      });
      if (updateResult.count === 0) {
        throw new NotFoundError('Contact not found.');
      }

      // Upsert or delete custom field values.
      for (const [token, value] of customEntries) {
        const field = fieldByName.get(token);
        if (!field) continue;
        if (value === null || value === undefined) {
          // Clear the value.
          await tx.contactFieldValue.deleteMany({
            where: { contact_id: contactId, field_id: field.id },
          });
        } else {
          await tx.contactFieldValue.upsert({
            where: {
              contact_id_field_id: { contact_id: contactId, field_id: field.id },
            },
            create: {
              contact_id: contactId,
              field_id: field.id,
              value: String(value),
            },
            update: { value: String(value) },
          });
        }
      }
      return updateResult;
    });

    if (result.count === 0) {
      return respondError(new NotFoundError('Contact not found.'), ctx.requestId);
    }

    return respondOk(null, ctx.requestId, 'Contact updated.');
  } catch (error) {
    if (error instanceof NotFoundError) {
      return respondError(error, ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, {
  auth: {
    ownership: async (params) => {
      const c = await getPrisma().contact.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!c) throw new NotFoundError('Contact not found.');
      return c.user_id;
    },
  },
  rateLimitKey: 'contact-update',
});

const _DELETE = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  await getPrisma().contact.deleteMany({
    where: { id: parsed.data.id, user_id: ctx.user.id },
  });

  return respondOk(null, ctx.requestId, 'Contact deleted.');
}, {
  auth: {
    ownership: async (params) => {
      const c = await getPrisma().contact.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!c) throw new NotFoundError('Contact not found.');
      return c.user_id;
    },
  },
  rateLimitKey: 'contact-delete',
});


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}
