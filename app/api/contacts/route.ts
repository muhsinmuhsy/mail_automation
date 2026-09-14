import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery, dateRangeWhere } from '@/lib/api/list';
import {
  buildCreateContactSchema,
  splitContactPayload,
  type ContactFieldDefinition,
} from '@/lib/validation/contact';
import { ConflictError, ValidationError, fromPrismaError } from '@/lib/errors';

/**
 * Contacts API (Path C, Phase 4).
 * See docs/CUSTOM_MERGE_FIELDS.md §4 Phase 4.
 *
 * - GET uses the 3-query pattern (field defs once → contacts → values by
 *   contact IDs) to avoid N+1 on large lists.
 * - POST fetches the user's ContactField rows, builds a dynamic schema, parses,
 *   then creates the Contact + custom field values in a transaction.
 */

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search, sortBy, sortOrder, startDate, endDate } = parseListQuery(req, { search: true, sortable: ['created_at'], dateRange: true });

  const where = {
    user_id: ctx.user.id,
    ...dateRangeWhere('created_at', startDate, endDate),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  // 3-query pattern (§8 item 5): field defs once → contacts → values.
  const [fieldDefs, contacts, total] = await Promise.all([
    getPrisma().contactField.findMany({
      where: { user_id: ctx.user.id },
      orderBy: { sort_order: 'asc' },
      select: { id: true, name: true, label: true, field_type: true, is_required: true, options: true },
    }),
    getPrisma().contact.findMany({
      where,
      select: { id: true, name: true, email: true },
      orderBy: { [sortBy ?? 'created_at']: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().contact.count({ where }),
  ]);

  // Fetch all custom values for the page of contacts in one query.
  const contactIds = contacts.map((c) => c.id);
  const fieldValues = contactIds.length > 0
    ? await getPrisma().contactFieldValue.findMany({
        where: { contact_id: { in: contactIds } },
        select: { contact_id: true, field_id: true, value: true },
      })
    : [];

  // Index field definitions by id for O(1) lookup.
  const fieldDefById = new Map(fieldDefs.map((f) => [f.id, f]));
  // Group values by contact_id.
  const valuesByContact = new Map<string, Array<{ name: string; value: string | null }>>();
  for (const v of fieldValues) {
    const def = fieldDefById.get(v.field_id);
    if (!def) continue;
    const arr = valuesByContact.get(v.contact_id) ?? [];
    arr.push({ name: def.name, value: v.value });
    valuesByContact.set(v.contact_id, arr);
  }

  // Join values onto contacts.
  const data = contacts.map((c) => ({
    ...c,
    custom_fields: Object.fromEntries(
      (valuesByContact.get(c.id) ?? []).map(({ name, value }) => [name, value])
    ),
  }));

  return respondList(data, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();

  // Fetch the user's field definitions to build the dynamic schema.
  const fieldDefs = await getPrisma().contactField.findMany({
    where: { user_id: ctx.user.id },
    select: { id: true, name: true, field_type: true, is_required: true, options: true },
  });
  const schema = buildCreateContactSchema(fieldDefs as ContactFieldDefinition[]);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const { builtins, custom } = splitContactPayload(
    parsed.data as Record<string, unknown>,
    fieldDefs as ContactFieldDefinition[]
  );
  const customEntries = Object.entries(custom);
  const fieldByName = new Map(fieldDefs.map((f) => [f.name, f]));

  try {
    const contact = await getPrisma().$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          user_id: ctx.user.id,
          name: (builtins.name as string | undefined) ?? null,
          email: builtins.email as string,
        },
        select: { id: true, name: true, email: true },
      });

      if (customEntries.length > 0) {
        const valueRows = customEntries
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([token, value]) => ({
            contact_id: created.id,
            field_id: fieldByName.get(token)!.id,
            value: String(value),
          }));
        if (valueRows.length > 0) {
          await tx.contactFieldValue.createMany({ data: valueRows });
        }
      }

      return created;
    });

    return respondOk(contact, ctx.requestId, 'Contact added successfully.', 201);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return respondError(new ConflictError('This contact already exists.'), ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, { auth: 'user', rateLimitKey: 'contact-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
