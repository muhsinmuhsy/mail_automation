import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as contactsGet } from '@/app/api/contacts/route';
import { GET as campaignsGet } from '@/app/api/campaigns/route';
import { GET as emailsGet } from '@/app/api/emails/route';
import { GET as emailAccountsGet } from '@/app/api/email-accounts/route';

const mockPrisma = {
  contact: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  campaign: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  emailJob: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  emailAccount: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  user: {
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({ session: { user: { id: 'user-1' } } }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

describe('API list endpoints — pagination & search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockPrisma.contact.findMany).mockResolvedValue([{ id: 'c1', name: 'Alice', email: 'a@b.com' }]);
    vi.mocked(mockPrisma.contact.count).mockResolvedValue(1);
    vi.mocked(mockPrisma.campaign.findMany).mockResolvedValue([{ id: 'p1', name: 'Launch', status: 'ACTIVE' }]);
    vi.mocked(mockPrisma.campaign.count).mockResolvedValue(1);
    vi.mocked(mockPrisma.emailJob.findMany).mockResolvedValue([{ id: 'e1', to_email: 'x@y.com', status: 'SENT' }]);
    vi.mocked(mockPrisma.emailJob.count).mockResolvedValue(1);
    vi.mocked(mockPrisma.emailAccount.findMany).mockResolvedValue([{ id: 'a1', email: 'me@gmail.com' }]);
    vi.mocked(mockPrisma.emailAccount.count).mockResolvedValue(1);
  });

  it('contacts: returns pagination metadata and applies page/limit', async () => {
    const request = new NextRequest('http://localhost/api/contacts?page=2&limit=10');
    const response = await contactsGet(request);
    const body = (await response.json()) as {
      success: boolean;
      data: unknown[];
      pagination: { total: number; page: number; pageSize: number; totalPages: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 2, pageSize: 10, totalPages: 1 });
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    expect(mockPrisma.contact.count).toHaveBeenCalled();
  });

  it('contacts: applies case-insensitive search across name and email', async () => {
    const request = new NextRequest('http://localhost/api/contacts?search=ali');
    await contactsGet(request);

    const where = vi.mocked(mockPrisma.contact.findMany).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'ali', mode: 'insensitive' } },
      { email: { contains: 'ali', mode: 'insensitive' } },
    ]);
  });

  it('campaigns: filters by status and search', async () => {
    const request = new NextRequest('http://localhost/api/campaigns?status=ACTIVE&search=launch');
    await campaignsGet(request);

    const where = vi.mocked(mockPrisma.campaign.findMany).mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.name).toEqual({ contains: 'launch', mode: 'insensitive' });
  });

  it('emails: filters by status and to_email search', async () => {
    const request = new NextRequest('http://localhost/api/emails?status=SENT&search=y.com');
    await emailsGet(request);

    const where = vi.mocked(mockPrisma.emailJob.findMany).mock.calls[0][0].where;
    expect(where.status).toBe('SENT');
    expect(where.to_email).toEqual({ contains: 'y.com', mode: 'insensitive' });
  });

  it('email-accounts: applies email search', async () => {
    const request = new NextRequest('http://localhost/api/email-accounts?search=gmail.com');
    await emailAccountsGet(request);

    const where = vi.mocked(mockPrisma.emailAccount.findMany).mock.calls[0][0].where;
    expect(where.email).toEqual({ contains: 'gmail.com', mode: 'insensitive' });
  });

  it('ignores unknown status values', async () => {
    const request = new NextRequest('http://localhost/api/campaigns?status=NOT_A_STATUS');
    await campaignsGet(request);

    const where = vi.mocked(mockPrisma.campaign.findMany).mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });
});
