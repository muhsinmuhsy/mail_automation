'use client';

import { Button } from '@/components/ui/Button';

export type ContactFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface ContactCustomFieldValue {
  label: string;
  value: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  company?: string;
  /** Custom field label/value pairs, keyed by token name. */
  custom_fields?: Record<string, string | null>;
}

interface ContactCardProps {
  contact: Contact;
  onDelete?: (id: string) => void;
  deleting?: boolean;
  /** Custom field definitions for label lookup. If omitted, custom field keys are shown as-is. */
  fieldLabels?: Record<string, string>;
}

export function ContactCard({ contact, onDelete, deleting = false, fieldLabels }: ContactCardProps) {
  const customEntries = contact.custom_fields
    ? Object.entries(contact.custom_fields).filter(([, v]) => v != null && v !== '')
    : [];

  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{contact.name}</p>
          <p className="text-sm text-text-secondary">{contact.email}</p>
          {customEntries.length > 0 && (
            <dl className="mt-2 flex flex-col gap-1">
              {customEntries.map(([token, value]) => (
                <div key={token} className="flex gap-2 text-sm">
                  <dt className="text-text-secondary">{fieldLabels?.[token] ?? token}:</dt>
                  <dd className="text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          )}
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
