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
}

export function TemplateList({ templates, onEdit, onPreview }: TemplateListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}
