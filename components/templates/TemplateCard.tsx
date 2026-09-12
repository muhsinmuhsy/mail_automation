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
}

export function TemplateCard({ template, onEdit, onPreview }: TemplateCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{template.name}</p>
      <p className="text-sm text-text-secondary">{template.subject}</p>
      {(onEdit || onPreview) && (
        <div className="mt-3 flex gap-2">
          {onEdit && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(template)}>Edit</Button>
          )}
          {onPreview && (
            <Button variant="secondary" size="sm" onClick={() => onPreview(template)}>Preview</Button>
          )}
        </div>
      )}
    </div>
  );
}
