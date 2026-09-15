'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export type ContactFieldType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown';

export interface ContactFieldDef {
  id: string;
  name: string;
  label: string;
  field_type: ContactFieldType;
  is_required: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface ContactFormProps {
  onSubmit: (data: { name?: string; email: string; customFields?: Record<string, string> }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  fields?: ContactFieldDef[];
  initialValues?: { name?: string; email?: string; customFields?: Record<string, string> };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateContactForm(
  name: string,
  email: string,
  customValues: Record<string, string>,
  fields: ContactFieldDef[]
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Invalid email format';
  }

  if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer';
  }

  for (const field of fields) {
    const value = customValues[field.name] ?? '';

    if (field.is_required) {
      if (field.field_type === 'boolean') {
        if (value !== 'true') {
          errors[field.name] = `${field.label} is required`;
          continue;
        }
      } else if (!value.trim()) {
        errors[field.name] = `${field.label} is required`;
        continue;
      }
    }

    if (value.trim() && field.field_type === 'number' && !NUMBER_REGEX.test(value)) {
      errors[field.name] = `${field.label} must be a valid number`;
    }

    if (value.trim() && field.field_type === 'date' && !DATE_REGEX.test(value)) {
      errors[field.name] = `${field.label} must be a valid date (YYYY-MM-DD)`;
    }

    if (value.trim() && field.field_type === 'dropdown') {
      const optionValues = (field.options ?? []).map((o) => o.value);
      if (!optionValues.includes(value)) {
        errors[field.name] = `${field.label} must be one of the available options`;
      }
    }
  }

  return errors;
}

/**
 * Renders a custom field input based on its type (§11.15).
 * boolean → checkbox; others → Input with the appropriate type attribute.
 */
function CustomFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: ContactFieldDef;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  if (field.field_type === 'boolean') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            className="h-4 w-4 rounded border-neutral-300"
          />
          {field.label}{field.is_required && <span className="text-error"> *</span>}
        </label>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }
  if (field.field_type === 'dropdown') {
    return (
      <Select
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
        required={field.is_required}
        error={error}
        placeholder="Select…"
      />
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
      error={error}
    />
  );
}

export function ContactForm({ onSubmit, saving = false, error, fields = [], initialValues }: ContactFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialValues?.customFields ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sortedFields = [...fields].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  const clearFieldError = (key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const validationErrors = validateContactForm(name, email, customValues, fields);
        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          return;
        }
        setErrors({});
        const hasCustom = Object.keys(customValues).length > 0;
        await onSubmit({
          name: name || undefined,
          email,
          ...(hasCustom ? { customFields: customValues } : {}),
        });
      }}
      className="flex flex-col gap-4"
    >
      <Input
        label="Name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          clearFieldError('name');
        }}
        error={errors.name}
      />
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          clearFieldError('email');
        }}
        required
        error={errors.email}
      />
      {sortedFields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={customValues[field.name] ?? ''}
          error={errors[field.name]}
          onChange={(value) => {
            setCustomValues((prev) => ({ ...prev, [field.name]: value }));
            clearFieldError(field.name);
          }}
        />
      ))}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
