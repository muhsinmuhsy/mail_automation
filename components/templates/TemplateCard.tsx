'use client';

interface Template {
  id: string;
  name: string;
  subject: string;
}

export function TemplateCard({ template }: { template: Template }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{template.name}</p>
      <p className="text-sm text-text-secondary">{template.subject}</p>
    </div>
  );
}
