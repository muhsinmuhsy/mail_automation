import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createContactFieldSchema } from '@/lib/validation/contact-field';
import { LIMITS } from '@/lib/validation/merge-field-names';
import {
  ConflictError,
  ValidationError,
  fromPrismaError,
} from '@/lib/errors';

/**
 * Contact field definitions API (Path C, Phase 4).
 * See docs/CUSTOM_MERGE_FIELDS.md §4 Phase 4 and §11.10 (authorization).
 *
 * Every query is scoped by `user_id: ctx.user.id` — never by `id` alone.
 */

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const where = {
    user_id: ctx.user.id,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { label: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [fields, total] = await Promise.all([
    getPrisma().contactField.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().contactField.count({ where }),
  ]);

  return respondList(fields, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = createContactFieldSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  // Resource limit (§11.14): cap custom fields per user.
  const existingCount = await getPrisma().contactField.count({
    where: { user_id: ctx.user.id },
  });
  if (existingCount >= LIMITS.MAX_CUSTOM_FIELDS_PER_USER) {
    return respondError(
      new ValidationError(
        `You can have at most ${LIMITS.MAX_CUSTOM_FIELDS_PER_USER} custom fields.`
      ),
      ctx.requestId
    );
  }

  try {
    const field = await getPrisma().contactField.create({
      data: {
        user_id: ctx.user.id,
        name: parsed.data.name,
        label: parsed.data.label,
        field_type: parsed.data.field_type,
        sort_order: parsed.data.sort_order,
        is_required: parsed.data.is_required,
      },
    });

    return respondOk(field, ctx.requestId, 'Field created successfully.', 201);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return respondError(
        new ConflictError('A field with this token already exists.'),
        ctx.requestId
      );
    }
    throw fromPrismaError(error);
  }
}, { auth: 'user', rateLimitKey: 'contact-field-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
