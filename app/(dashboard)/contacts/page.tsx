'use client';

import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactImport } from '@/components/contacts/ContactImport';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEffect, useState } from 'react';

type ApiResponse<T> = { data: T; message?: string };
type Contact = { id: string; name: string; email: string; company?: string };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/contacts');
        const payload = (await response.json()) as ApiResponse<Contact[]>;
        if (!active) return;
        if (!response.ok) throw new Error(payload.message || 'Unable to load contacts.');
        setContacts(payload.data);
      } catch (cause) {
        if (!active) return;
        setError((cause as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Contacts</h1>
        <p className="mt-2 text-text-secondary">Manage your contacts for campaigns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Add contact</h2>
          <ContactForm onSubmit={async (data) => {
            setError(null);
            const response = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const payload = await response.json() as ApiResponse<{ id: string; name: string; email: string; company?: string }>;
            if (!response.ok) { const message = payload.message || 'Unable to save contact.'; setError(message); throw new Error(message); }
            setContacts((previous) => [...previous, payload.data]);
          }} />
        </div>

        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Import contacts</h2>
          <ContactImport onImport={(file) => {
            console.log('Importing', file.name);
          }} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add your first contact or import from CSV."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      )}
    </div>
  );
}
