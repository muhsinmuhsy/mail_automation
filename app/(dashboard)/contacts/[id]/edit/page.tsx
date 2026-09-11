'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ContactForm, type ContactFieldDef } from '@/components/contacts/ContactForm';

type ContactDetail = {
  id: string;
  name: string;
  email: string;
  custom_fields?: Record<string, string | null>;
};

type ApiResponse<T> = { data: T; message?: string };

export default function ContactEditPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [fieldDefs, setFieldDefs] = useState<ContactFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    const timer = setTimeout(() => {
      Promise.all([
        fetch(`/api/contacts/${contactId}`).then((r) => r.json()) as Promise<ApiResponse<ContactDetail>>,
        fetch('/api/contact-fields').then((r) => r.json()) as Promise<{ success: boolean; data?: Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }> }>,
      ])
        .then(([contactRes, fieldsRes]) => {
          if (!contactRes.data) throw new Error(contactRes.message || 'Contact not found.');
          setContact(contactRes.data);
          if (fieldsRes.success && fieldsRes.data) {
            setFieldDefs(fieldsRes.data.map((f) => ({
              id: f.id, name: f.name, label: f.label,
              field_type: f.field_type as ContactFieldDef['field_type'],
              is_required: f.is_required,
            })));
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load contact.'))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [contactId]);

  const handleSubmit = async (data: { name?: string; email: string; customFields?: Record<string, string> }) => {
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = { email: data.email };
      if (data.name) body.name = data.name;
      if (data.customFields) Object.assign(body, data.customFields);
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message || 'Unable to save contact.');
      router.push(`/contacts/${contactId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const customFieldValues = contact?.custom_fields
    ? Object.fromEntries(Object.entries(contact.custom_fields).filter(([, v]) => v != null) as [string, string][])
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Edit Contact</h1>
          <p className="mt-2 text-text-secondary">Update contact details and custom fields.</p>
        </div>
        <Button variant="secondary" onClick={() => router.push(`/contacts/${contactId}`)}>Cancel</Button>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : contact ? (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <ContactForm
            onSubmit={handleSubmit}
            saving={saving}
            error={formError}
            fields={fieldDefs}
            initialValues={{ name: contact.name, email: contact.email, customFields: customFieldValues }}
          />
        </div>
      ) : null}
    </div>
  );
}
