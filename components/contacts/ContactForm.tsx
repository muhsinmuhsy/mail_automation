'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ContactFormProps {
  onSubmit: (data: { name: string; email: string; company?: string }) => Promise<void | boolean>;
}

export function ContactForm({ onSubmit }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          const ok = await onSubmit({ name, email, company: company || undefined });
          if (ok !== false) {
            setName('');
            setEmail('');
            setCompany('');
          }
        } finally {
          setPending(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
    </form>
  );
}
