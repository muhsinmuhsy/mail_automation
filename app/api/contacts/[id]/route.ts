import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateContactSchema } from '@/lib/validation/contact';
import { NotFoundError, ValidationError } from '@/lib/errors';

const _PATCH = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();
  const updateParsed = updateContactSchema.safeParse(body);
  if (!updateParsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const result = await getPrisma().contact.updateMany({
    where: { id: parsed.data.id },
    data: updateParsed.data,
  });

  if (result.count === 0) {
    return respondError(new NotFoundError('Contact not found.'), ctx.requestId);
  }

  return respondOk(null, ctx.requestId, 'Contact updated.');
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
    where: { id: parsed.data.id },
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


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}
