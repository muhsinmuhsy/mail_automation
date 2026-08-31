import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createContactSchema } from '@/lib/validation/contact';
import { ConflictError, ValidationError, fromPrismaError } from '@/lib/errors';

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const where = {
    user_id: ctx.user.id,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [contacts, total] = await Promise.all([
    getPrisma().contact.findMany({
      where,
      select: { id: true, name: true, email: true, company: true, job_title: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().contact.count({ where }),
  ]);

  return respondList(contacts, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = createContactSchema.safeParse(body);
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
    const contact = await getPrisma().contact.create({
      data: {
        user_id: ctx.user.id,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company,
        job_title: parsed.data.job_title,
        notes: parsed.data.notes,
      },
      select: { id: true, name: true, email: true, company: true, job_title: true },
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
