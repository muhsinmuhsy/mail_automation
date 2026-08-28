'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function EmailAccountForm({ onSubmit }: { onSubmit: (data: { provider: string; email: string }) => void }) {
  const [provider, setProvider] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ provider, email });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="provider" className="text-sm font-medium text-text-primary">
          Provider
        </label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="flex h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm"
        >
          <option value="">Select provider</option>
          <option value="gmail">Gmail</option>
          <option value="microsoft">Microsoft</option>
          <option value="yahoo">Yahoo</option>
          <option value="custom_smtp">Custom SMTP</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-text-primary">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit">Connect</Button>
    </form>
  );
}
