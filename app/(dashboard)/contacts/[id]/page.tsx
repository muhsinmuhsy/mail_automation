'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ContactEditDialog, } from '@/components/contacts/ContactEditDialog';
import type { ContactFieldDef } from '@/components/contacts/ContactForm';

type ContactDetail = {
  id: string;
  name: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  custom_fields?: Record<string, string | null>;
};

type ApiResponse<T> = { data: T; message?: string };

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [fieldDefs, setFieldDefs] = useState<ContactFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!contactId) return;
    const timer = setTimeout(() => {
      setLoading(true);
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

  const fieldLabels = Object.fromEntries(fieldDefs.map((f) => [f.name, f.label]));
  const customEntries = contact?.custom_fields
    ? Object.entries(contact.custom_fields).filter(([, v]) => v != null && v !== '')
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Contact</h1>
          <p className="mt-2 text-text-secondary">View and edit contact details.</p>
        </div>
        <Button variant="secondary" onClick={() => router.push('/contacts')}>Back</Button>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : contact ? (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">{contact.name || '(no name)'}</h2>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
          </div>

          <dl className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2 text-sm">
              <dt className="text-text-secondary">Email:</dt>
              <dd className="text-text-primary">{contact.email}</dd>
            </div>
            {customEntries.map(([token, value]) => (
              <div key={token} className="flex gap-2 text-sm">
                <dt className="text-text-secondary">{fieldLabels[token] ?? token}:</dt>
                <dd className="text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>

          {contact.created_at && (
            <p className="mt-4 text-xs text-supporting text-text-secondary">
              Created {new Date(contact.created_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : null}

      <ContactEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contactId={contactId}
        fields={fieldDefs}
        onSaved={() => { setLoading(true); void fetch(`/api/contacts/${contactId}`).then((r) => r.json() as Promise<ApiResponse<ContactDetail>>).then((res) => setContact(res.data)).finally(() => setLoading(false)); }}
      />
    </div>
  );
}
