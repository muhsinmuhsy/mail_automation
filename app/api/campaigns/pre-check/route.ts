import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { uuid } from '@/lib/validation/common';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { runMissingValueCheck } from '@/lib/campaigns/missing-values';
import { z } from 'zod';

/**
 * Campaign pre-check endpoint (§11.16, §11.25).
 *
 * Scans the template for {{token}} patterns, maps them to built-in and custom
 * fields, queries the selected contacts for missing values, and returns the
 * counts. The UI shows a warning before the user confirms scheduling.
 */

const preCheckSchema = z.object({
  templateId: uuid,
  contactIds: z.array(uuid).min(1),
});

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = preCheckSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError('Please correct the highlighted fields.'),
      ctx.requestId
    );
  }

  const { templateId, contactIds } = parsed.data;

  const template = await getPrisma().template.findFirst({
    where: { id: templateId, user_id: ctx.user.id },
    select: { id: true, subject: true, body: true, body_text: true, body_html: true },
  });
  if (!template) {
    return respondError(
      new ForbiddenError('Template not found or does not belong to you.'),
      ctx.requestId
    );
  }

  const contactCount = await getPrisma().contact.count({
    where: { id: { in: contactIds }, user_id: ctx.user.id },
  });
  if (contactCount !== contactIds.length) {
    return respondError(
      new ForbiddenError('One or more contacts do not belong to you.'),
      ctx.requestId
    );
  }

  const result = await runMissingValueCheck(
    getPrisma(),
    ctx.user.id,
    template.subject,
    template.body_html ?? template.body_text ?? template.body,
    contactIds
  );

  return respondOk(result, ctx.requestId);
}, { auth: 'user' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
