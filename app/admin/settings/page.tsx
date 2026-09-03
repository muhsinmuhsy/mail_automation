'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSettingsForm, type AdminSettingsValues } from '@/components/admin/AdminSettingsForm';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminSettingsValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>(undefined);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ id: Date.now(), message, type });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { status, body } = await requestJson<AdminSettingsValues | null>('/api/admin/settings', {
          signal,
        });
        if (status === 401) {
          router.replace('/login');
          return;
        }
        if (body.success) {
          setSettings(body.data);
          setError(null);
        } else {
          setError(body.error.message);
        }
      } catch {
        if (signal?.aborted) return;
        setError('Failed to load settings.');
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

  const save = async (values: AdminSettingsValues) => {
    setSaving(true);
    setFieldErrors(undefined);
    try {
      const { status, body } = await requestJson<AdminSettingsValues>('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (status === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        setSettings(body.data);
        showToast(body.message ?? 'Settings updated.', 'success');
      } else {
        setFieldErrors(body.error.fields);
        showToast(body.error.message, 'error');
      }
    } catch {
      showToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold">Settings</h1>
        <p className="mt-2 text-body text-text-secondary">
          Global sending limits and the system-wide email sending switch.
        </p>
      </div>

      <div className="max-w-lg rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        {loading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <ErrorState title="Could not load settings" message={error} onRetry={retry} />
        ) : !settings ? (
          <ErrorState
            title="Settings unavailable"
            message="System settings have not been initialised yet."
            onRetry={retry}
          />
        ) : (
          <AdminSettingsForm
            settings={settings}
            saving={saving}
            fieldErrors={fieldErrors}
            onSave={(values) => void save(values)}
          />
        )}
      </div>

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
