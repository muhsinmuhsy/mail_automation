import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireUser, requireAdmin, requireOwnership, getDbRole } from '@/lib/auth/guards';
import { AuthenticationError, ForbiddenError, NotFoundError } from '@/lib/errors';

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('@/lib/auth/neon-auth', () => ({
  getSession: vi.fn(),
  auth: {},
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

import { getSession } from '@/lib/auth/neon-auth';

describe('lib/auth/guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER', is_active: true });
  });

  it('requireUser throws when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('requireUser returns the session user when authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' } } as never);
    const user = await requireUser();
    expect(user.id).toBe('u1');
  });

  it('requireAdmin throws for non-admin users', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER', is_active: true });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requireAdmin succeeds for admins', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', is_active: true });
    const ctx = await requireAdmin();
    expect(ctx.role).toBe('ADMIN');
  });

  it('requireOwnership allows the owner regardless of role', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER', is_active: true });
    const ctx = await requireOwnership('u1');
    expect(ctx.sessionUser.id).toBe('u1');
  });

  it('requireOwnership rejects another user who is not admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u2', email: 'c@d.com' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER', is_active: true });
    await expect(requireOwnership('u1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getDbRole throws when the user record is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(getDbRole('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getDbRole throws for inactive users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER', is_active: false });
    await expect(getDbRole('u1')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
