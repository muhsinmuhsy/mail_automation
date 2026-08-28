'use client';

import { TemplateCard } from '@/components/templates/TemplateCard';
import { TemplateForm } from '@/components/templates/TemplateForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string }>>([]);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-2 text-text-secondary">Create and manage email templates.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
        >
          {showForm ? 'Cancel' : 'New template'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <TemplateForm onSubmit={(data) => {
            setTemplates((prev) => [...prev, { id: Date.now().toString(), ...data }]);
            setShowForm(false);
          }} />
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create your first email template to get started."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
