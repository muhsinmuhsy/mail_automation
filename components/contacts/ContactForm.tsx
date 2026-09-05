'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ContactFormProps {
  onSubmit: (data: { name: string; email: string; company?: string }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
}

export function ContactForm({ onSubmit, saving = false, error }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ name, email, company: company || undefined });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
