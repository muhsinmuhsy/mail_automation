'use client';

interface Contact {
  id: string;
  name: string;
  email: string;
  company?: string;
}

export function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{contact.name}</p>
      <p className="text-sm text-text-secondary">{contact.email}</p>
    </div>
  );
}
