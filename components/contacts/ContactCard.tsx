'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{contact.name}</p>
          <p className="text-sm text-text-secondary">{contact.email}</p>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            aria-label={`Delete ${contact.name}`}
            className="inline-flex h-8 items-center justify-center rounded-[var(--radius-md)] px-3 text-sm font-medium text-text-secondary hover:bg-error/10 hover:text-error disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete contact"
        description={`Are you sure you want to delete ${contact.name}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={() => onDelete?.(contact.id)}
      />
    </div>
  );
}
