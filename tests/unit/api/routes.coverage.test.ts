import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { prismaMock, resetPrisma, makeReq, CTX, UUID } from './mocks';
import { encryptSecret } from '@/lib/security/encryption';

const KEY = 'a'.repeat(64);
process.env.SMTP_ENCRYPTION_KEY = KEY;

vi.mock('@/lib/db', () => ({ getPrisma: () => prismaMock }));
vi.mock('@/lib/api/route', () => ({ defineRoute: (handler: any) => handler }));
vi.mock('@/lib/campaigns/create', () => ({
  createCampaign: vi.fn().mockResolvedValue({
    campaignId: 'c1',
    campaignName: 'n',
    status: 'created',
    recipientSummary: { policyVersion: 1, selectedCount: 1, eligibleCount: 1, excludedCount: 0 },
    jobCount: 1,
  }),
}));
vi.mock('@/lib/auth/neon-auth', () => ({
  auth: {
    handler: () => ({
      GET: async () => NextResponse.json({ ok: true }),
      POST: async () => NextResponse.json({ ok: true }),
      PUT: async () => NextResponse.json({ ok: true }),
      PATCH: async () => NextResponse.json({ ok: true }),
      DELETE: async () => NextResponse.json({ ok: true }),
    }),
  },
}));
vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: () => ({
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/lib/email/providers/gmail', () => ({
  GmailProvider: class {
    async testConnection() {
      return { success: true, message: 'connected' };
    }
  },
}));

import * as health from '@/app/api/health/route';
import * as adminDashboard from '@/app/api/admin/dashboard/route';
import * as adminSettings from '@/app/api/admin/settings/route';
import * as adminCampaigns from '@/app/api/admin/campaigns/route';
import * as adminEmails from '@/app/api/admin/emails/route';
import * as adminUsers from '@/app/api/admin/users/route';
import * as adminCampaignCancel from '@/app/api/admin/campaigns/[id]/cancel/route';
import * as adminCampaignPause from '@/app/api/admin/campaigns/[id]/pause/route';
import * as adminUserById from '@/app/api/admin/users/[id]/route';
import * as adminUserDisable from '@/app/api/admin/users/[id]/disable/route';
import * as adminUserEnable from '@/app/api/admin/users/[id]/enable/route';
import * as authCatchAll from '@/app/api/auth/[...path]/route';
import * as campaigns from '@/app/api/campaigns/route';
import * as campaignById from '@/app/api/campaigns/[id]/route';
import * as campaignCancel from '@/app/api/campaigns/[id]/cancel/route';
import * as campaignPause from '@/app/api/campaigns/[id]/pause/route';
import * as campaignResume from '@/app/api/campaigns/[id]/resume/route';
import * as campaignRetryFailed from '@/app/api/campaigns/[id]/retry-failed/route';
import * as contacts from '@/app/api/contacts/route';
import * as contactById from '@/app/api/contacts/[id]/route';
import * as contactsImport from '@/app/api/contacts/import-csv/route';
import * as emailAccounts from '@/app/api/email-accounts/route';
import * as emailAccountById from '@/app/api/email-accounts/[id]/route';
import * as emailAccountReactivate from '@/app/api/email-accounts/[id]/reactivate/route';
import * as emailAccountTest from '@/app/api/email-accounts/[id]/test/route';
import * as emails from '@/app/api/emails/route';
import * as emailById from '@/app/api/emails/[id]/route';
import * as emailRetry from '@/app/api/emails/[id]/retry/route';
import * as attachments from '@/app/api/attachments/route';
import * as attachmentById from '@/app/api/attachments/[id]/route';
import * as attachmentDefault from '@/app/api/attachments/[id]/default/route';
import * as templates from '@/app/api/templates/route';
import * as templateById from '@/app/api/templates/[id]/route';

async function ok(res: any) {
  const body = await res.json();
  expect(body.success).toBe(true);
}
async function fail(res: any) {
  const body = await res.json();
  expect(body.success).toBe(false);
}

beforeEach(() => {
  resetPrisma();
  prismaMock.campaign.findMany.mockResolvedValue([]);
  prismaMock.emailJob.groupBy.mockResolvedValue([]);
});

describe('app/api route handlers (unit coverage)', () => {
  it('health GET returns ok', async () => {
    const res = await (health as any).GET();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('admin/dashboard GET aggregates users and settings', async () => {
    prismaMock.user.count.mockResolvedValue(7);
    prismaMock.systemSetting.findUnique.mockResolvedValue({ id: 1, default_daily_email_limit: 100 });
    const res = await (adminDashboard as any).GET(makeReq(), CTX());
    await ok(res);
  });

  it('admin/settings GET returns settings', async () => {
    prismaMock.systemSetting.findUnique.mockResolvedValue({ id: 1 });
    await ok((await (adminSettings as any).GET(makeReq(), CTX())));
  });

  it('admin/settings PATCH updates settings when valid', async () => {
    prismaMock.systemSetting.update.mockResolvedValue({ id: 1 });
    const res = await (adminSettings as any).PATCH(
      makeReq({ json: { default_daily_email_limit: 200, global_daily_email_limit: 500, email_sending_enabled: true } }),
      CTX()
    );
    await ok(res);
  });

  it('admin/settings PATCH rejects invalid body', async () => {
    const res = await (adminSettings as any).PATCH(makeReq({ json: {} }), CTX());
    await fail(res);
  });

  it('admin/campaigns GET lists campaigns', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([]);
    prismaMock.campaign.count.mockResolvedValue(0);
    await ok((await (adminCampaigns as any).GET(makeReq(), CTX())));
  });

  it('admin/emails GET lists email jobs', async () => {
    prismaMock.emailJob.findMany.mockResolvedValue([]);
    prismaMock.emailJob.count.mockResolvedValue(0);
    await ok((await (adminEmails as any).GET(makeReq(), CTX())));
  });

  it('admin/users GET lists users', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await ok((await (adminUsers as any).GET(makeReq(), CTX())));
  });

  it('admin/campaigns/[id]/cancel cancels when found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.campaign.update.mockResolvedValue({});
    await ok((await (adminCampaignCancel as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/campaigns/[id]/cancel 404 when missing', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null);
    await fail((await (adminCampaignCancel as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/campaigns/[id]/pause pauses when found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.campaign.update.mockResolvedValue({});
    await ok((await (adminCampaignPause as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/users/[id] GET returns the user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UUID });
    await ok((await (adminUserById as any).GET(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/users/[id] GET 404 when missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await fail((await (adminUserById as any).GET(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/users/[id] PATCH updates the user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UUID, role: 'USER' });
    prismaMock.user.update.mockResolvedValue({ id: UUID });
    const res = await (adminUserById as any).PATCH(makeReq({ json: { is_active: false } }), CTX({ id: UUID }));
    await ok(res);
  });

  it('admin/users/[id] PATCH rejects the last active admin self-disable', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    const res = await (adminUserById as any).PATCH(makeReq({ json: { is_active: false } }), CTX({ id: UUID }));
    await fail(res);
  });

  it('admin/users/[id]/disable disables a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UUID, role: 'USER' });
    prismaMock.user.update.mockResolvedValue({});
    await ok((await (adminUserDisable as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/users/[id]/disable forbids self admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    await fail((await (adminUserDisable as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('admin/users/[id]/enable enables a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.user.update.mockResolvedValue({});
    await ok((await (adminUserEnable as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('auth catch-all routes delegate to the Neon Auth handler', async () => {
    const getRes = await (authCatchAll as any).GET(makeReq(), { params: Promise.resolve({ path: [] }) });
    expect((await getRes.json()).ok).toBe(true);
    const postRes = await (authCatchAll as any).POST(makeReq(), { params: Promise.resolve({ path: [] }) });
    expect((await postRes.json()).ok).toBe(true);
    const delRes = await (authCatchAll as any).DELETE(makeReq(), { params: Promise.resolve({ path: [] }) });
    expect((await delRes.json()).ok).toBe(true);
  });

  it('campaigns GET lists user campaigns', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([]);
    prismaMock.campaign.count.mockResolvedValue(0);
    await ok((await (campaigns as any).GET(makeReq(), CTX())));
  });

  it('campaigns POST creates a campaign and schedules jobs', async () => {
    prismaMock.emailAccount.findFirst.mockResolvedValue({ id: UUID, provider: 'gmail' });
    prismaMock.attachment.findFirst.mockResolvedValue({ id: UUID });
    prismaMock.template.findFirst.mockResolvedValue({ id: UUID, subject: 'Hello {{name}}', body: 'Hi {{name}}' });
    prismaMock.contact.count.mockResolvedValue(2);
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue({ id: 'c1', name: 'n', status: 'ACTIVE', created_at: new Date(), start_at: new Date(), timezone: 'UTC', interval_minutes: 5, daily_limit: null, _count: { email_jobs: 1 } });
    const body = {
      name: 'Launch',
      email_account_id: UUID,
      attachment_id: UUID,
      template_id: UUID,
      contact_ids: [UUID, '00000000-0000-0000-0000-000000000002'],
      start_at: '2030-01-01T00:00:00Z',
      timezone: 'UTC',
      interval_minutes: 60,
      daily_limit: 100,
      idempotency_key: '00000000-0000-0000-0000-000000000003',
      preview_fingerprint: 'a'.repeat(64),
    };
    const res = await (campaigns as any).POST(makeReq({ json: body }), CTX());
    await ok(res);
  });

  it('campaigns POST rejects invalid input', async () => {
    const res = await (campaigns as any).POST(makeReq({ json: {} }), CTX());
    await fail(res);
  });

  it('campaigns/[id] GET returns the campaign', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.emailJob.groupBy.mockResolvedValue([]);
    await ok((await (campaignById as any).GET(makeReq(), CTX({ id: UUID }))));
  });

  it('campaigns/[id] GET 404 when missing', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null);
    await fail((await (campaignById as any).GET(makeReq(), CTX({ id: UUID }))));
  });

  it('campaigns/[id]/cancel cancels via updateMany', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID, status: 'ACTIVE' });
    prismaMock.campaign.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.emailJob.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (campaignCancel as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('campaigns/[id]/pause pauses via updateMany', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID, status: 'ACTIVE' });
    prismaMock.campaign.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (campaignPause as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('campaigns/[id]/resume resumes via updateMany', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID, status: 'PAUSED' });
    prismaMock.campaign.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (campaignResume as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('contacts GET lists contacts', async () => {
    prismaMock.contactField.findMany.mockResolvedValue([]);
    prismaMock.contactFieldValue.findMany.mockResolvedValue([]);
    prismaMock.contact.findMany.mockResolvedValue([]);
    prismaMock.contact.count.mockResolvedValue(0);
    await ok((await (contacts as any).GET(makeReq(), CTX())));
  });

  it('contacts POST creates a contact', async () => {
    prismaMock.contactField.findMany.mockResolvedValue([]);
    prismaMock.contact.create.mockResolvedValue({ id: 'c1' });
    const res = await (contacts as any).POST(
      makeReq({ json: { name: 'Jane', email: 'jane@example.com' } }),
      CTX()
    );
    await ok(res);
  });

  it('contacts POST rejects invalid input', async () => {
    prismaMock.contactField.findMany.mockResolvedValue([]);
    const res = await (contacts as any).POST(makeReq({ json: { name: '' } }), CTX());
    await fail(res);
  });

  it('contacts POST reports conflict on P2002', async () => {
    prismaMock.contactField.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.contact.create.mockRejectedValue({ code: 'P2002' });
    await fail((await (contacts as any).POST(makeReq({ json: { name: 'Jane', email: 'jane@example.com' } }), CTX())));
  });

  it('contacts/[id] PATCH updates a contact', async () => {
    prismaMock.contactField.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.contact.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (contactById as any).PATCH(makeReq({ json: { name: 'Jane' } }), CTX({ id: UUID }))));
  });

  it('contacts/[id] DELETE removes a contact', async () => {
    prismaMock.contact.deleteMany.mockResolvedValue({ count: 1 });
    await ok((await (contactById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });

  it('contacts/import-csv requires a csv file', async () => {
    const fd = new FormData();
    await fail((await (contactsImport as any).POST(makeReq({ formData: fd }), CTX())));
  });

  it('contacts/import-csv imports valid rows', async () => {
    const csv = 'name,email\nJane,jane@example.com';
    const file = new File([csv], 'c.csv', { type: 'text/csv' });
    const fd = new FormData();
    fd.append('csv', file);
    prismaMock.contactField.findMany.mockResolvedValue([]);
    prismaMock.contact.findFirst.mockResolvedValue(null);
    prismaMock.contact.create.mockResolvedValue({ id: 'c1' });
    const res = await (contactsImport as any).POST(makeReq({ formData: fd }), CTX());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.imported).toBe(1);
  });

  it('email-accounts GET lists accounts', async () => {
    prismaMock.emailAccount.findMany.mockResolvedValue([]);
    prismaMock.emailAccount.count.mockResolvedValue(0);
    await ok((await (emailAccounts as any).GET(makeReq(), CTX())));
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('email-accounts POST connects an account', async () => {
    prismaMock.emailAccount.create.mockResolvedValue({ id: 'ea1' });
    const res = await (emailAccounts as any).POST(
      makeReq({ json: { provider: 'gmail', email: 'a@b.com', auth_method: 'app_password', secret: 'pw' } }),
      CTX()
    );
    await ok(res);
  });
  */

  it('email-accounts POST rejects invalid input', async () => {
    const res = await (emailAccounts as any).POST(makeReq({ json: {} }), CTX());
    await fail(res);
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('email-accounts/[id] PATCH updates secret when active', async () => {
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID, is_active: true });
    prismaMock.emailAccount.update.mockResolvedValue({});
    const res = await (emailAccountById as any).PATCH(makeReq({ json: { secret: 'pw' } }), CTX({ id: UUID }));
    await ok(res);
  });

  it('email-accounts/[id] PATCH rejects deactivated account', async () => {
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID, is_active: false });
    await fail((await (emailAccountById as any).PATCH(makeReq({ json: { secret: 'pw' } }), CTX({ id: UUID }))));
  });
  */

  it('email-accounts/[id] DELETE keeps pending jobs', async () => {
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.emailJob.count.mockResolvedValue(2);
    prismaMock.emailAccount.update.mockResolvedValue({});
    await ok((await (emailAccountById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });

  it('email-accounts/[id] DELETE deactivates when no pending jobs', async () => {
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.emailJob.count.mockResolvedValue(0);
    prismaMock.emailAccount.update.mockResolvedValue({});
    await ok((await (emailAccountById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('email-accounts/[id]/reactivate reactivates', async () => {
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.emailAccount.update.mockResolvedValue({});
    await ok((await (emailAccountReactivate as any).POST(makeReq(), CTX({ id: UUID }))));
  });
  */

  // App password disabled — commented out for future re-enablement
  /*
  it('email-accounts/[id]/test connects when credentials exist', async () => {
    const secret = await encryptSecret('pw', KEY);
    prismaMock.emailAccount.findUnique.mockResolvedValue({ id: UUID, email: 'a@b.com', encrypted_secret: secret });
    const res = await (emailAccountTest as any).POST(makeReq(), CTX({ id: UUID }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
  });
  */

  it('emails GET lists email jobs', async () => {
    prismaMock.emailJob.findMany.mockResolvedValue([]);
    prismaMock.emailJob.count.mockResolvedValue(0);
    await ok((await (emails as any).GET(makeReq(), CTX())));
  });

  it('emails/[id] GET returns the job with logs', async () => {
    prismaMock.emailJob.findUnique.mockResolvedValue({ id: UUID, email_logs: [] });
    await ok((await (emailById as any).GET(makeReq(), CTX({ id: UUID }))));
  });

  it('emails/[id]/retry resets a FAILED job to SCHEDULED', async () => {
    prismaMock.emailJob.findUnique.mockResolvedValue({ id: UUID, status: 'FAILED', campaign_id: null });
    prismaMock.emailJob.update.mockResolvedValue({ id: UUID });
    await ok((await (emailRetry as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('campaigns/[id]/retry-failed resets all FAILED jobs', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: UUID, status: 'ACTIVE' });
    prismaMock.emailJob.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (campaignRetryFailed as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('attachments GET lists attachments', async () => {
    prismaMock.attachment.findMany.mockResolvedValue([]);
    prismaMock.attachment.count.mockResolvedValue(0);
    await ok((await (attachments as any).GET(makeReq(), CTX())));
  });

  it('attachments POST uploads a valid pdf', async () => {
    const bytes = new TextEncoder().encode('%PDF-valid');
    const file = new File([bytes], 'attachment.pdf', { type: 'application/pdf' });
    const fd = new FormData();
    fd.append('file', file);
    prismaMock.attachment.create.mockResolvedValue({ id: 'a1' });
    const res = await (attachments as any).POST(makeReq({ formData: fd }), CTX());
    await ok(res);
  });

  it('attachments/[id] DELETE removes when no pending jobs', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.campaign.count.mockResolvedValue(0);
    prismaMock.emailJob.count.mockResolvedValue(0);
    prismaMock.attachment.delete.mockResolvedValue({});
    await ok((await (attachmentById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });

  it('attachments/[id] DELETE retains when pending jobs exist', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.campaign.count.mockResolvedValue(0);
    prismaMock.emailJob.count.mockResolvedValue(3);
    prismaMock.attachment.update.mockResolvedValue({});
    await fail((await (attachmentById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });

  it('attachments/[id]/default sets the default attachment', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({ id: UUID });
    prismaMock.$transaction.mockResolvedValue([]);
    await ok((await (attachmentDefault as any).POST(makeReq(), CTX({ id: UUID }))));
  });

  it('templates GET lists templates', async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    prismaMock.template.count.mockResolvedValue(0);
    await ok((await (templates as any).GET(makeReq(), CTX())));
  });

  it('templates POST creates a template', async () => {
    prismaMock.template.create.mockResolvedValue({ id: 't1' });
    const res = await (templates as any).POST(
      makeReq({ json: { name: 'T', subject: 'S', body: 'B' } }),
      CTX()
    );
    await ok(res);
  });

  it('templates POST rejects invalid input', async () => {
    const res = await (templates as any).POST(makeReq({ json: { name: '' } }), CTX());
    await fail(res);
  });

  it('templates/[id] PATCH updates a template', async () => {
    prismaMock.template.updateMany.mockResolvedValue({ count: 1 });
    await ok((await (templateById as any).PATCH(makeReq({ json: { name: 'T2' } }), CTX({ id: UUID }))));
  });

  it('templates/[id] DELETE removes a template', async () => {
    prismaMock.template.deleteMany.mockResolvedValue({ count: 1 });
    await ok((await (templateById as any).DELETE(makeReq(), CTX({ id: UUID }))));
  });
});
