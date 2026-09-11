'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type ContactFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface ContactFieldDef {
  id: string;
  name: string;
  label: string;
  field_type: ContactFieldType;
  is_required: boolean;
}

interface ContactFormProps {
  onSubmit: (data: { name?: string; email: string; customFields?: Record<string, string> }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  fields?: ContactFieldDef[];
  initialValues?: { name?: string; email?: string; customFields?: Record<string, string> };
}

/**
 * Renders a custom field input based on its type (§11.15).
 * boolean → checkbox; others → Input with the appropriate type attribute.
 */
function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: ContactFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.field_type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          required={field.is_required}
          className="h-4 w-4 rounded border-neutral-300"
        />
        {field.label}
      </label>
    );
  }
  const inputType = field.field_type === 'text' ? 'text' : field.field_type;
  return (
    <Input
      label={field.label}
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.is_required}
    />
  );
}

export function ContactForm({ onSubmit, saving = false, error, fields = [], initialValues }: ContactFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialValues?.customFields ?? {});

  const sortedFields = [...fields].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const hasCustom = Object.keys(customValues).length > 0;
        await onSubmit({
          name: name || undefined,
          email,
          ...(hasCustom ? { customFields: customValues } : {}),
        });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {sortedFields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={customValues[field.name] ?? ''}
          onChange={(value) =>
            setCustomValues((prev) => ({ ...prev, [field.name]: value }))
          }
        />
      ))}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
