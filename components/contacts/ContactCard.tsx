'use client';

import { Button } from '@/components/ui/Button';

interface Contact {
  id: string;
  name: string;
  email: string;
  company?: string;
}

interface ContactCardProps {
  contact: Contact;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}

export function ContactCard({ contact, onDelete, deleting = false }: ContactCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{contact.name}</p>
          <p className="text-sm text-text-secondary">{contact.email}</p>
        </div>
        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(contact.id)}
            disabled={deleting}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
