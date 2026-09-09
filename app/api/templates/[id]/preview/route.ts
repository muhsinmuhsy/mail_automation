import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema, uuid } from '@/lib/validation/common';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors';
import { replaceTemplateVariables, type TemplateContact } from '@/lib/email/template';
import { buildTemplateContact, type ContactFieldDefinition, type ContactFieldValueRow } from '@/lib/email/template-contact';
import { z } from 'zod';

const previewSchema = z.object({
  contactId: uuid.optional(),
});

/**
 * POST /api/templates/[id]/preview
 *
 * Loads the template, substitutes merge tags into body_html and body_text using
 * replaceTemplateVariables, and returns { html, text, subject } for the preview
 * pane. No save. See docs/TEMPLATICAL_EMAIL_BUILDER.md §7.2.
 *
 * Security: if contactId is provided, verifies the contact belongs to the
 * authenticated user. The preview HTML is rendered in a sandboxed iframe
 * client-side (scripts disabled) — this route returns raw HTML for the iframe
 * srcdoc; the client is responsible for sandboxing.
 */
const _POST = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();
  const bodyParsed = previewSchema.safeParse(body);
  if (!bodyParsed.success) {
    return respondError(
      new ValidationError('Please correct the highlighted fields.'),
      ctx.requestId
    );
  }

  const template = await getPrisma().template.findFirst({
    where: { id: parsed.data.id, user_id: ctx.user.id },
    select: { id: true, subject: true, body_html: true, body_text: true, body: true },
  });

  if (!template) {
    return respondError(new NotFoundError('Template not found.'), ctx.requestId);
  }

  const html = template.body_html ?? null;
  const text = template.body_text ?? template.body;

  let contact: TemplateContact | null = null;

  if (bodyParsed.data.contactId) {
    const [contactRow, fieldDefs, fieldValues] = await Promise.all([
      getPrisma().contact.findFirst({
        where: { id: bodyParsed.data.contactId, user_id: ctx.user.id },
        select: { id: true, name: true, email: true },
      }),
      getPrisma().contactField.findMany({
        where: { user_id: ctx.user.id },
        select: { id: true, name: true, field_type: true },
      }),
      getPrisma().contactFieldValue.findMany({
        where: { contact_id: bodyParsed.data.contactId },
        select: { field_id: true, value: true },
      }),
    ]);

    if (!contactRow) {
      return respondError(
        new ForbiddenError('Contact not found or does not belong to you.'),
        ctx.requestId
      );
    }

    contact = buildTemplateContact(
      { name: contactRow.name, email: contactRow.email },
      fieldValues as ContactFieldValueRow[],
      fieldDefs as ContactFieldDefinition[]
    );
  }

  const sampleContact: TemplateContact = contact ?? { name: 'John Doe', email: 'john@example.com' };

  const resolvedSubject = replaceTemplateVariables(template.subject, sampleContact);
  const resolvedHtml = html ? replaceTemplateVariables(html, sampleContact) : null;
  const resolvedText = replaceTemplateVariables(text, sampleContact);

  return respondOk(
    { html: resolvedHtml, text: resolvedText, subject: resolvedSubject },
    ctx.requestId
  );
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
  rateLimitKey: 'template-preview',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
