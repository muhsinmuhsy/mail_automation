import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createTemplateSchema } from '@/lib/validation/template';
import { ConflictError, ValidationError, fromPrismaError } from '@/lib/errors';

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const where = {
    user_id: ctx.user.id,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [templates, total] = await Promise.all([
    getPrisma().template.findMany({
      where,
      select: { id: true, name: true, subject: true, created_at: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().template.count({ where }),
  ]);

  return respondList(templates, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  try {
    const template = await getPrisma().template.create({
      data: {
        user_id: ctx.user.id,
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      select: { id: true, name: true, subject: true, created_at: true },
    });

    return respondOk(template, ctx.requestId, 'Template created successfully.', 201);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return respondError(new ConflictError('This template already exists.'), ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, { auth: 'user', rateLimitKey: 'template-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
