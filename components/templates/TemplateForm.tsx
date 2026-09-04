'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

interface TemplateFormProps {
  onSubmit: (data: { name: string; subject: string; body: string }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
}

export function TemplateForm({ onSubmit, saving = false, error }: TemplateFormProps) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, subject, body });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} required />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save template'}
      </Button>
    </form>
  );
}
