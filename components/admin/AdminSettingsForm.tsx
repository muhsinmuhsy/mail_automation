'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AdminSettingsForm() {
  const [limit, setLimit] = useState('500');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
      }}
      className="flex flex-col gap-4 max-w-md"
    >
      <Input label="Global daily email limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
      <Button type="submit">Save settings</Button>
    </form>
  );
}
