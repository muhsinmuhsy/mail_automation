'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ContactForm({ onSubmit }: { onSubmit: (data: { name: string; email: string; company?: string }) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, company });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      <Button type="submit">Save</Button>
    </form>
  );
}
