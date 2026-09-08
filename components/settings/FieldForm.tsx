'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  generateTokenFromLabel,
  validateFieldName,
  ensureUniqueToken,
  LIMITS,
} from '@/lib/validation/merge-field-names';

export type FieldFormType = 'text' | 'number' | 'date' | 'boolean';

export interface FieldFormValues {
  label: string;
  name: string;
  field_type: FieldFormType;
  is_required: boolean;
}

interface FieldFormProps {
  onSubmit: (values: FieldFormValues) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  /** Existing field tokens to avoid collisions when generating. */
  existingTokens?: readonly string[];
  /** Optional initial values (for edit mode). */
  initialValues?: Partial<FieldFormValues>;
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
];

/**
 * Field creation/edit form (§11.15).
 *
 * Label-first UX: the primary input is the human-readable label. The token is
 * auto-generated from the label and shown read-only below. An "Edit token"
 * toggle reveals an advanced input for users who want to override.
 */
export function FieldForm({
  onSubmit,
  saving = false,
  error = null,
  existingTokens = [],
  initialValues,
}: FieldFormProps) {
  const [label, setLabel] = useState(initialValues?.label ?? '');
  const [manualToken, setManualToken] = useState<string | null>(
    initialValues?.name ?? null
  );
  const [fieldType, setFieldType] = useState<FieldFormType>(
    initialValues?.field_type ?? 'text'
  );
  const [isRequired, setIsRequired] = useState(
    initialValues?.is_required ?? false
  );
  const [editToken, setEditToken] = useState(false);

  const autoToken = useMemo(() => {
    const generated = generateTokenFromLabel(label);
    return generated ? ensureUniqueToken(generated, existingTokens) : '';
  }, [label, existingTokens]);

  const name = editToken && manualToken !== null ? manualToken : autoToken;

  const tokenError = useMemo(() => {
    if (!editToken || manualToken === null) return null;
    const err = validateFieldName(manualToken);
    if (err) return err;
    if (existingTokens.includes(manualToken.toLowerCase())) {
      return 'A field with this token already exists.';
    }
    return null;
  }, [editToken, manualToken, existingTokens]);

  const handleEditTokenToggle = () => {
    if (!editToken) {
      setManualToken(autoToken);
    }
    setEditToken(!editToken);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const err = validateFieldName(name);
    if (err) return;
    await onSubmit({
      label: label.trim(),
      name,
      field_type: fieldType,
      is_required: isRequired,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Field label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
        maxLength={LIMITS.MAX_FIELD_LABEL_LENGTH}
        placeholder="e.g. T-shirt size"
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="field-token" className="text-sm font-medium text-text-primary">
            Token
          </label>
          <button
            type="button"
            onClick={handleEditTokenToggle}
            className="text-xs text-information hover:underline"
          >
            {editToken ? 'Auto-generate' : 'Edit token'}
          </button>
        </div>
        <input
          id="field-token"
          type="text"
          value={name}
          onChange={(e) => setManualToken(e.target.value)}
          readOnly={!editToken}
          maxLength={LIMITS.MAX_FIELD_NAME_LENGTH}
          className={[
            'flex h-10 w-full rounded-[var(--radius-md)] border bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1',
            tokenError ? 'border-error' : 'border-neutral-200',
            !editToken ? 'text-text-secondary' : '',
          ].join(' ')}
        />
        <p className="text-xs text-text-secondary">
          Used in templates as <code>{`{{${name || 'token'}}}`}</code>
        </p>
        {tokenError && <p className="text-xs text-error">{tokenError}</p>}
      </div>
      <Select
        label="Field type"
        value={fieldType}
        onChange={(e) => setFieldType(e.target.value as FieldFormType)}
        options={TYPE_OPTIONS}
      />
      <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Required
      </label>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving || !label.trim() || !!tokenError}>
        {saving ? 'Saving…' : 'Save field'}
      </Button>
    </form>
  );
}
