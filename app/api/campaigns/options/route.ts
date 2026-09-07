import { NextRequest } from 'next/server';
import { defineRoute } from '@/lib/api/route';
import { respondOk } from '@/lib/api/respond';
import { getPrisma } from '@/lib/db';
import { ENABLED_PROVIDERS } from '@/lib/email/providers/registry';

/** One authenticated request, parallel reads, no unused pagination counts. */
const getOptions = defineRoute(async (_req, ctx) => {
  const db = getPrisma();
  const where = { user_id: ctx.user.id };
  const [accounts, attachments, templates, contacts] = await Promise.all([
    db.emailAccount.findMany({ where: { ...where, is_active: true }, select: { id: true, email: true, provider: true }, orderBy: { created_at: 'desc' } }),
    db.attachment.findMany({ where: { ...where, deleted_at: null }, select: { id: true, filename: true, size_bytes: true }, orderBy: { created_at: 'desc' } }),
    db.template.findMany({ where, select: { id: true, name: true, subject: true }, orderBy: { created_at: 'desc' } }),
    db.contact.findMany({ where, select: { id: true, name: true, email: true, company: true }, orderBy: { name: 'asc' } }),
  ]);
  const response = respondOk({
    emailAccounts: accounts.filter(account => ENABLED_PROVIDERS.has(account.provider)).map(account => ({ id: account.id, label: account.email, provider: account.provider })),
    attachments: attachments.map(file => ({ id: file.id, label: file.filename, size_bytes: file.size_bytes })),
    templates: templates.map(template => ({ id: template.id, label: template.name, description: template.subject })),
    contacts: contacts.map(contact => ({ id: contact.id, label: contact.name, description: [contact.email, contact.company].filter(Boolean).join(' · ') })),
  }, ctx.requestId);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}, { auth: 'user' });

export function GET(req: NextRequest) { return getOptions(req, { params: {} }); }
