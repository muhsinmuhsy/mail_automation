'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUserTable, type AdminUserRow } from '@/components/admin/AdminUserTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { Toast } from '@/components/ui/Toast';

type Envelope<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: { type?: string; message: string; fields?: Record<string, string> } };

interface ApiResponse<T> {
  status: number;
  body: Envelope<T>;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: 'include', ...init });
  try {
    return { status: response.status, body: (await response.json()) as Envelope<T> };
  } catch {
    return {
      status: response.status,
      body: { success: false, error: { message: 'Unexpected response from the server.' } },
    };
  }
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<AdminUserRow | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ id: Date.now(), message, type });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { status, body } = await requestJson<AdminUserRow[]>('/api/admin/users', { signal });
        if (status === 401) {
          router.replace('/login');
          return;
        }
        if (body.success) {
          setUsers(body.data);
          setError(null);
        } else {
          setError(body.error.message);
        }
      } catch {
        if (signal?.aborted) return;
        setError('Failed to load users.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  // `/api/admin/users` returns the full list, so filtering happens client-side.
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(term) ||
        (user.name ?? '').toLowerCase().includes(term)
    );
  }, [search, users]);

  const setActiveState = async (user: AdminUserRow, nextActive: boolean) => {
    setBusyUserId(user.id);
    try {
      const { status, body } = await requestJson<null>(
        `/api/admin/users/${user.id}/${nextActive ? 'enable' : 'disable'}`,
        { method: 'POST' }
      );
      if (status === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        showToast(body.message ?? (nextActive ? 'User enabled.' : 'User disabled.'), 'success');
        await load();
      } else {
        showToast(body.error.message, 'error');
      }
    } finally {
      setBusyUserId(null);
      setDisableTarget(null);
    }
  };

  const saveLimit = async (user: AdminUserRow, limit: number) => {
    setBusyUserId(user.id);
    try {
      const { status, body } = await requestJson<AdminUserRow>(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_email_limit_override: limit }),
      });
      if (status === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        showToast(body.message ?? 'Daily limit updated.', 'success');
        await load();
      } else {
        showToast(body.error.fields?.daily_email_limit_override ?? body.error.message, 'error');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold tracking-tight">Users</h1>
        <p className="mt-2 text-body text-text-secondary">
          Manage user accounts, account status and per-user daily email limits.
        </p>
      </div>

      <div className="max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by email or name" />
      </div>

      {loading ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState title="Could not load users" message={error} onRetry={retry} />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          title={users.length === 0 ? 'No users yet' : 'No users match your search'}
          description={
            users.length === 0
              ? 'Registered users appear here.'
              : 'Try a different email address or name.'
          }
        />
      ) : (
        <AdminUserTable
          users={visibleUsers}
          busyUserId={busyUserId}
          onSaveLimit={saveLimit}
          onToggleActive={(user) => {
            if (user.is_active === false) {
              void setActiveState(user, true);
            } else {
              setDisableTarget(user);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={disableTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
        title="Disable user"
        description={
          disableTarget
            ? `${disableTarget.email} will lose access and stop sending emails until re-enabled.`
            : ''
        }
        confirmLabel="Disable user"
        variant="destructive"
        loading={busyUserId !== null}
        onConfirm={() => {
          if (disableTarget) void setActiveState(disableTarget, false);
        }}
      />

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
