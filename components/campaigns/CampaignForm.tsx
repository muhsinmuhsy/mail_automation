'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface CampaignFormProps {
  onSubmit: (data: { name: string; emailAccountId: string; resumeId: string; templateId: string }) => void;
}

export function CampaignForm({ onSubmit }: CampaignFormProps) {
  const [name, setName] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, emailAccountId: '', resumeId: '', templateId: '' });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select label="Sending account" options={[]} />
      <Select label="Resume" options={[]} />
      <Select label="Template" options={[]} />
      <Button type="submit">Create campaign</Button>
    </form>
  );
}
