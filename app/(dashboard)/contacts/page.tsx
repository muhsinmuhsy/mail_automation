'use client';

import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactImport } from '@/components/contacts/ContactImport';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; email: string; company?: string }>>([]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-2 text-text-secondary">Manage your contacts for campaigns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Add contact</h2>
          <ContactForm onSubmit={(data) => setContacts((prev) => [...prev, { id: Date.now().toString(), ...data }])} />
        </div>

        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Import contacts</h2>
          <ContactImport onImport={(file) => {
            console.log('Importing', file.name);
          }} />
        </div>
      </div>

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
