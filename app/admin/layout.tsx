import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { AppError, AuthenticationError } from '@/lib/errors';
import { AdminNav } from './AdminNav';

// Admin pages read the Neon Auth session server-side (via `requireAdmin` →
// `getSession` → `cookies()`). They must never be statically prerendered, so
// force dynamic rendering for the entire /admin subtree.
export const dynamic = 'force-dynamic';

type AdminAccess = 'granted' | 'unauthenticated' | 'forbidden';

/**
 * Server-side gate for every `/admin` page. Authorization is based on the
 * database role (see `requireAdmin`), never on client-supplied data.
 * Unexpected errors are re-thrown so the error boundary can handle them.
 */
async function resolveAdminAccess(): Promise<AdminAccess> {
  try {
    await requireAdmin();
    return 'granted';
  } catch (error) {
    if (error instanceof AuthenticationError) return 'unauthenticated';
    if (error instanceof AppError && error.isOperational) return 'forbidden';
    throw error;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await resolveAdminAccess();
  if (access === 'unauthenticated') redirect('/login');
  if (access === 'forbidden') redirect('/dashboard');

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-surface flex flex-col">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Admin</h2>
        </div>
        <AdminNav />
        <div className="mt-auto border-t border-neutral-200 p-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-information hover:underline"
          >
            ← Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
