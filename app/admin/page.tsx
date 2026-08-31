'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminDashboard,
  type AdminDashboardActivity,
  type AdminDashboardSettings,
  type AdminDashboardStats,
} from '@/components/admin/AdminDashboard';

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Envelope<T> =
  | { success: true; data: T; message?: string; pagination?: PaginationMeta }
  | { success: false; error: { type?: string; message: string } };

interface ApiResponse<T> {
  status: number;
  body: Envelope<T>;
}

interface AdminDashboardPayload {
  totalUsers: number;
  settings: AdminDashboardSettings | null;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: 'include', signal });
  try {
    return { status: response.status, body: (await response.json()) as Envelope<T> };
  } catch {
    return {
      status: response.status,
      body: { success: false, error: { message: 'Unexpected response from the server.' } },
    };
  }
}

/** Uses the list `pagination.total` so counts come from the API, not the client. */
function totalOf(response: ApiResponse<unknown[]>): number {
  return response.body.success ? (response.body.pagination?.total ?? response.body.data.length) : 0;
}

function firstError(responses: Array<ApiResponse<unknown>>): string | null {
  for (const response of responses) {
    if (!response.body.success) return response.body.error.message;
  }
  return null;
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [overview, sent, queued, scheduled, failed, unknown, activeCampaigns, recent] =
          await Promise.all([
            requestJson<AdminDashboardPayload>('/api/admin/dashboard', signal),
            requestJson<unknown[]>('/api/admin/emails?limit=1&status=SENT', signal),
            requestJson<unknown[]>('/api/admin/emails?limit=1&status=QUEUED', signal),
            requestJson<unknown[]>('/api/admin/emails?limit=1&status=SCHEDULED', signal),
            requestJson<unknown[]>('/api/admin/emails?limit=1&status=FAILED', signal),
            requestJson<unknown[]>('/api/admin/emails?limit=1&status=DELIVERY_UNKNOWN', signal),
            requestJson<unknown[]>('/api/admin/campaigns?limit=1&status=ACTIVE', signal),
            requestJson<AdminDashboardActivity[]>('/api/admin/emails?limit=5', signal),
          ]);

        const responses = [
          overview,
          sent,
          queued,
          scheduled,
          failed,
          unknown,
          activeCampaigns,
          recent,
        ];

        if (responses.some((response) => response.status === 401)) {
          router.replace('/login');
          return;
        }

        const message = firstError(responses);
        if (message || !overview.body.success) {
          setStats(null);
          setError(message ?? 'Failed to load system statistics.');
          return;
        }

        setStats({
          totalUsers: overview.body.data.totalUsers,
          settings: overview.body.data.settings,
          activeCampaigns: totalOf(activeCampaigns),
          emailsSent: totalOf(sent),
          emailsQueued: totalOf(queued) + totalOf(scheduled),
          emailsFailed: totalOf(failed),
          emailsDeliveryUnknown: totalOf(unknown),
          recentActivity: recent.body.success ? recent.body.data : [],
        });
        setError(null);
      } catch {
        if (signal?.aborted) return;
        setError('Failed to load system statistics.');
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

  return <AdminDashboard stats={stats} loading={loading} error={error} onRetry={retry} />;
}
