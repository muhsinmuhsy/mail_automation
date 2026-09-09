'use client';

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
            <button
              type="button"
              onClick={() => onEdit(template)}
              className="rounded-[var(--radius-md)] bg-information px-3 py-1.5 text-xs font-medium text-white hover:bg-information/90"
            >
              Edit
            </button>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={() => onPreview(template)}
              className="rounded-[var(--radius-md)] border border-neutral-200 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-selected"
            >
              Preview
            </button>
          )}
        </div>
      )}
    </div>
  );
}
