import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/contacts/import-csv/route';

interface ImportCsvResponse {
  success: boolean;
  data?: { imported: number; duplicate: number; invalid: number; skipped: number };
  error?: { type: string; message: string };
}

const mockPrisma = {
  contact: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  contactField: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  contactFieldValue: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

describe('contacts/import-csv POST', () => {
  it('should import valid contacts and count duplicates and invalid', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    mockPrisma.contact.create.mockResolvedValue({});

    const csvContent = 'name,email\nJohn Doe,john@example.com\nJane Doe,jane@example.com\ninvalid-email,\n';
    const formData = new FormData();
    formData.append('csv', new File([csvContent], 'contacts.csv', { type: 'text/csv' }));

    const request = new NextRequest('http://localhost/api/contacts/import-csv', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    const response = await POST(request);
    const body = (await response.json()) as ImportCsvResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.imported).toBe(2);
    expect(body.data?.invalid).toBe(1);
    expect(body.data?.duplicate).toBe(0);
    expect(body.data?.skipped).toBe(0);
  });

  it('should count duplicates', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });

    const csvContent = 'name,email\nJohn Doe,john@example.com\n';
    const formData = new FormData();
    formData.append('csv', new File([csvContent], 'contacts.csv', { type: 'text/csv' }));

    const request = new NextRequest('http://localhost/api/contacts/import-csv', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    const response = await POST(request);
    const body = (await response.json()) as ImportCsvResponse;

    expect(response.status).toBe(200);
    expect(body.data?.imported).toBe(0);
    expect(body.data?.duplicate).toBe(1);
  });

  it('should return error when no csv file provided', async () => {
    const formData = new FormData();

    const request = new NextRequest('http://localhost/api/contacts/import-csv', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    const response = await POST(request);
    const body = (await response.json()) as ImportCsvResponse;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });
});
