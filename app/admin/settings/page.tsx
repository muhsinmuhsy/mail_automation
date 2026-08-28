'use client';

import { useState, useEffect } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SystemSettings {
  id: number;
  default_daily_email_limit: number;
  global_daily_email_limit: number;
  email_sending_enabled: boolean;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((res) => {
        if ((res as { success: boolean }).success) setSettings((res as { success: boolean; data: SystemSettings }).data);
        else setError((res as { error?: { message: string } }).error?.message || 'Failed to load settings.');
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const result = await res.json() as { success: boolean; data: SystemSettings; error?: { message: string } };
      if (result.success) {
        setSettings(result.data);
        setSuccess('Settings saved.');
      } else {
        setError(result.error?.message || 'Failed to save settings.');
      }
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-text-secondary">Loading settings...</div>;
  if (error && !settings) return <div className="text-error">{error}</div>;
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-text-secondary">Global system configuration.</p>
      </div>

      <div className="max-w-lg rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        {success && <FormMessage type="success" message={success} />}
        {error && <FormMessage type="error" message={error} />}

        <div className="flex flex-col gap-4">
          <Input
            label="Default daily email limit"
            type="number"
            value={String(settings.default_daily_email_limit)}
            onChange={(e) => setSettings({ ...settings, default_daily_email_limit: Number(e.target.value) })}
          />
          <Input
            label="Global daily email limit"
            type="number"
            value={String(settings.global_daily_email_limit)}
            onChange={(e) => setSettings({ ...settings, global_daily_email_limit: Number(e.target.value) })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.email_sending_enabled}
              onChange={(e) => setSettings({ ...settings, email_sending_enabled: e.target.checked })}
            />
            <span className="text-sm font-medium text-text-primary">Enable email sending</span>
          </label>

          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
