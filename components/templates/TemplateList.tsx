'use client';

import { TemplateCard } from './TemplateCard';

interface Template {
  id: string;
  name: string;
  subject: string;
  created_at?: string;
}

interface TemplateListProps {
  templates: Template[];
  onEdit?: (template: Template) => void;
  onPreview?: (template: Template) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
  deletingId?: string | null;
}

export function TemplateList({ templates, onEdit, onPreview, onDelete, deleting = false, deletingId }: TemplateListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onPreview={onPreview}
          onDelete={onDelete}
          deleting={deleting && deletingId === template.id}
        />
      ))}
    </div>
  );
}
