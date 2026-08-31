'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InlineFieldError } from '@/components/ui/InlineFieldError';
import { Input } from '@/components/ui/Input';

export interface AdminSettingsValues {
  default_daily_email_limit: number;
  global_daily_email_limit: number;
  email_sending_enabled: boolean;
}

interface AdminSettingsFormProps {
  /**
   * Current settings. The form keeps its own draft state, so render it only
   * once the settings have loaded (a fresh mount picks up the new values).
   */
  settings?: AdminSettingsValues | null;
  saving?: boolean;
  /** Field errors returned by the API (`error.fields`). */
  fieldErrors?: Record<string, string>;
  onSave?: (values: AdminSettingsValues) => void;
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function AdminSettingsForm({
  settings = null,
  saving = false,
  fieldErrors,
  onSave,
}: AdminSettingsFormProps) {
  const [defaultLimit, setDefaultLimit] = useState(
    settings ? String(settings.default_daily_email_limit) : ''
  );
  const [globalLimit, setGlobalLimit] = useState(
    settings ? String(settings.global_daily_email_limit) : ''
  );
  const [sendingEnabled, setSendingEnabled] = useState(settings ? settings.email_sending_enabled : false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const errorFor = (field: string) => localErrors[field] ?? fieldErrors?.[field];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedDefault = parsePositiveInt(defaultLimit);
    const parsedGlobal = parsePositiveInt(globalLimit);
    const nextErrors: Record<string, string> = {};
    if (parsedDefault === null) {
      nextErrors.default_daily_email_limit = 'Enter a whole number greater than zero.';
    }
    if (parsedGlobal === null) {
      nextErrors.global_daily_email_limit = 'Enter a whole number greater than zero.';
    }
    setLocalErrors(nextErrors);
    if (parsedDefault === null || parsedGlobal === null) return;

    onSave?.({
      default_daily_email_limit: parsedDefault,
      global_daily_email_limit: parsedGlobal,
      email_sending_enabled: sendingEnabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <div>
        <Input
          label="Default daily email limit"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={defaultLimit}
          onChange={(event) => setDefaultLimit(event.target.value)}
        />
        <p className="mt-1 text-caption text-text-secondary">
          Applied to every user without a per-user override.
        </p>
        <InlineFieldError message={errorFor('default_daily_email_limit')} />
      </div>

      <div>
        <Input
          label="Global daily email limit"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={globalLimit}
          onChange={(event) => setGlobalLimit(event.target.value)}
        />
        <p className="mt-1 text-caption text-text-secondary">
          Maximum number of emails the whole system may send per day.
        </p>
        <InlineFieldError message={errorFor('global_daily_email_limit')} />
      </div>

      <div>
        <label htmlFor="email-sending-enabled" className="flex items-center gap-2">
          <input
            id="email-sending-enabled"
            type="checkbox"
            checked={sendingEnabled}
            onChange={(event) => setSendingEnabled(event.target.checked)}
            className="h-4 w-4 rounded-[var(--radius-sm)] border-neutral-300 text-information focus:ring-2 focus:ring-information"
          />
          <span className="text-sm font-medium text-text-primary">Enable email sending</span>
        </label>
        <p className="mt-1 text-caption text-text-secondary">
          When disabled, queued emails stay queued and nothing is delivered.
        </p>
        <InlineFieldError message={errorFor('email_sending_enabled')} />
      </div>

      <Button type="submit" loading={saving} disabled={saving}>
        Save settings
      </Button>
    </form>
  );
}
