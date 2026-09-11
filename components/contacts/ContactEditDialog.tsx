'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { ContactForm, type ContactFieldDef } from './ContactForm';

interface ContactEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  fields: ContactFieldDef[];
  onSaved: () => void;
}

type ContactDetail = {
  id: string;
  name: string;
  email: string;
  custom_fields?: Record<string, string | null>;
};

export function ContactEditDialog({ open, onOpenChange, contactId, fields, onSaved }: ContactEditDialogProps) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !contactId) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/contacts/${contactId}`)
        .then(async (res) => {
          const payload = (await res.json()) as { data?: ContactDetail; message?: string };
          if (!res.ok) throw new Error(payload.message || 'Unable to load contact.');
          setContact(payload.data ?? null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load contact.'))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [open, contactId]);

  const handleSubmit = async (data: { name?: string; email: string; customFields?: Record<string, string> }) => {
    if (!contactId) return;
    setSaving(true);
    setError(null);
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
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const customFields = contact?.custom_fields
    ? Object.fromEntries(Object.entries(contact.custom_fields).filter(([, v]) => v != null) as [string, string][])
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit contact">
      {loading ? (
        <p className="text-sm text-text-secondary">Loading…</p>
      ) : contact ? (
        <ContactForm
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          fields={fields}
          initialValues={{ name: contact.name, email: contact.email, customFields }}
        />
      ) : (
        <p className="text-sm text-error">{error ?? 'Contact not found.'}</p>
      )}
    </Dialog>
  );
}
