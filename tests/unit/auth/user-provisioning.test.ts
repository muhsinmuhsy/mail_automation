import { describe, it, expect, vi } from 'vitest';
import { ensureUserProfile } from '@/lib/auth/user-provisioning';

const mockPrisma = {
  user: {
    upsert: vi.fn(),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/db/prisma', () => ({
  createPrisma: vi.fn(() => mockPrisma),
}));

describe('lib/auth/user-provisioning', () => {
  it('creates user profile when missing', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', email: 'test@example.com', name: 'Test' });

    await ensureUserProfile('user-1', 'test@example.com', 'Test');

    expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      update: { email: 'test@example.com' },
      create: { id: 'user-1', email: 'test@example.com', name: 'Test' },
    });
  });

  it('updates email when profile exists', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'Test' });

    await ensureUserProfile('user-1', 'new@example.com', 'Test');

    expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      update: { email: 'new@example.com' },
      create: { id: 'user-1', email: 'new@example.com', name: 'Test' },
    });
  });

  it('creates profile without name', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

    await ensureUserProfile('user-1', 'test@example.com');

    expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      update: { email: 'test@example.com' },
      create: { id: 'user-1', email: 'test@example.com' },
    });
  });
});
