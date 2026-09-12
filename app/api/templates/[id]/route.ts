import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateTemplateSchema } from '@/lib/validation/template';
import { NotFoundError, ValidationError, ConflictError, fromPrismaError } from '@/lib/errors';
import { renderTemplate } from '@/lib/email/render';

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const template = await getPrisma().template.findFirst({
    where: { id: parsed.data.id, user_id: ctx.user.id },
    select: {
      id: true,
      name: true,
      subject: true,
      body: true,
      body_json: true,
      body_mjml: true,
      body_html: true,
      body_text: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!template) {
    return respondError(new NotFoundError('Template not found.'), ctx.requestId);
  }

  return respondOk(template, ctx.requestId);
}, { auth: 'user' });

const _PATCH = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();
  const updateParsed = updateTemplateSchema.safeParse(body);
  if (!updateParsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const { bodyJson, body: legacyBody, ...patchData } = updateParsed.data;

  try {
    if (bodyJson !== undefined) {
      const rendered = await renderTemplate(bodyJson);

      const result = await getPrisma().template.updateMany({
        where: { id: parsed.data.id, user_id: ctx.user.id },
        data: {
          ...patchData,
          body_json: bodyJson,
          body_mjml: rendered.mjml,
          body_html: rendered.html,
          body_text: rendered.text,
          body: rendered.text,
        },
      });

      if (result.count === 0) {
        return respondError(new NotFoundError('Template not found.'), ctx.requestId);
      }

      return respondOk(null, ctx.requestId, 'Template updated.');
    }

    const data: Record<string, unknown> = { ...patchData };
    if (legacyBody !== undefined) {
      data.body = legacyBody;
      data.body_text = legacyBody;
      data.body_json = null;
      data.body_mjml = null;
      data.body_html = null;
    }

    const result = await getPrisma().template.updateMany({
      where: { id: parsed.data.id, user_id: ctx.user.id },
      data,
    });

    if (result.count === 0) {
      return respondError(new NotFoundError('Template not found.'), ctx.requestId);
    }

    return respondOk(null, ctx.requestId, 'Template updated.');
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return respondError(error, ctx.requestId);
    }
    throw fromPrismaError(error);
  }
}, {
  auth: {
    ownership: async (params) => {
      const t = await getPrisma().template.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!t) throw new NotFoundError('Template not found.');
      return t.user_id;
    },
  },
  rateLimitKey: 'template-update',
});

const _DELETE = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const campaignCount = await getPrisma().campaign.count({
    where: { template_id: parsed.data.id, user_id: ctx.user.id },
  });

  if (campaignCount > 0) {
    return respondError(
      new ConflictError(
        `This template is used by ${campaignCount} campaign(s) and cannot be deleted. Remove it from those campaigns first.`
      ),
      ctx.requestId
    );
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.emailJob.deleteMany({
      where: { template_id: parsed.data.id, user_id: ctx.user.id },
    });

    await tx.template.deleteMany({
      where: { id: parsed.data.id, user_id: ctx.user.id },
    });
  });

  return respondOk(null, ctx.requestId, 'Template deleted.');
}, {
  auth: {
    ownership: async (params) => {
      const t = await getPrisma().template.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!t) throw new NotFoundError('Template not found.');
      return t.user_id;
    },
  },
  rateLimitKey: 'template-delete',
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
