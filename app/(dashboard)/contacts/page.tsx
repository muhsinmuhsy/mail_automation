'use client';

import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactImport } from '@/components/contacts/ContactImport';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useEffect, useState } from 'react';

type ApiResponse<T> = { data: T; message?: string };
type Contact = { id: string; name: string; email: string; company?: string };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/contacts');
        const payload = (await response.json()) as ApiResponse<Contact[]>;
        if (!active) return;
        if (!response.ok) throw new Error(payload.message || 'Unable to load contacts.');
        setContacts(payload.data);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError((cause as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (data: { name: string; email: string; company?: string }) => {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const payload = (await response.json()) as ApiResponse<{ id: string; name: string; email: string; company?: string }>;
      if (!response.ok) { const message = payload.message || 'Unable to save contact.'; setFormError(message); return; }
      setContacts((previous) => [...previous, payload.data]);
      setShowAddContact(false);
    } catch {
      setFormError('Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      const payload = (await response.json()) as ApiResponse<null>;
      if (!response.ok) { setError(payload.message || 'Unable to delete contact.'); return; }
      setContacts((previous) => previous.filter((contact) => contact.id !== id));
    } catch {
      setError('Unable to delete contact.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Contacts</h1>
          <p className="mt-2 text-text-secondary">Manage your contacts for campaigns.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowAddContact(!showAddContact); setShowImport(false); }}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
          >
            {showAddContact ? 'Cancel' : 'Add contact'}
          </button>
          <button
            onClick={() => { setShowImport(!showImport); setShowAddContact(false); }}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-neutral-300 bg-background px-4 py-2 text-sm font-medium text-text-primary hover:bg-neutral-50"
          >
            {showImport ? 'Cancel' : 'Import contacts'}
          </button>
        </div>
      </div>

      {showAddContact && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Add contact</h2>
          <ContactForm onSubmit={handleSubmit} saving={saving} error={formError} />
        </div>
      )}

      {showImport && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Import contacts</h2>
          <ContactImport onImport={(file) => {
            console.log('Importing', file.name);
          }} />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add your first contact or import from CSV."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onDelete={handleDelete}
              deleting={deletingId === contact.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
