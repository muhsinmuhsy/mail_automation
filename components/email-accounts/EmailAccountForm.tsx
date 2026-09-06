'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const providerOptions = [
  { value: '', label: 'Select provider' },
  { value: 'gmail', label: 'Gmail' },
];

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
      <Select
        id="provider"
        label="Provider"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        options={providerOptions}
        required
      />
      <Input
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <Button type="submit">Connect</Button>
    </form>
  );
}
