'use client';

import { ContactCard } from './ContactCard';

interface Contact {
  id: string;
  name: string;
  email: string;
  custom_fields?: Record<string, string | null>;
}

interface ContactListProps {
  contacts: Contact[];
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  deleting?: boolean;
  deletingId?: string | null;
  fieldLabels?: Record<string, string>;
}

export function ContactList({ contacts, onDelete, onView, onEdit, deleting = false, deletingId, fieldLabels }: ContactListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onDelete={onDelete}
          onView={onView}
          onEdit={onEdit}
          deleting={deleting && deletingId === contact.id}
          fieldLabels={fieldLabels}
        />
      ))}
    </div>
  );
}
