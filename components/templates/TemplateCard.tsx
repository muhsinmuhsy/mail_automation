'use client';

import { Button } from '@/components/ui/Button';

interface Template {
  id: string;
  name: string;
  subject: string;
  created_at?: string;
}

interface TemplateCardProps {
  template: Template;
  onEdit?: (template: Template) => void;
  onPreview?: (template: Template) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}

export function TemplateCard({ template, onEdit, onPreview, onDelete, deleting = false }: TemplateCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{template.name}</p>
      <p className="text-sm text-text-secondary">{template.subject}</p>
      {(onEdit || onPreview || onDelete) && (
        <div className="mt-3 flex gap-2">
          {onEdit && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(template)}>Edit</Button>
          )}
          {onPreview && (
            <Button variant="secondary" size="sm" onClick={() => onPreview(template)}>Preview</Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(template.id)} disabled={deleting}>Delete</Button>
          )}
        </div>
      )}
    </div>
  );
}
