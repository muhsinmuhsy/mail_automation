'use client';

import { Button } from '@/components/ui/Button';

interface ContactImportProps {
  onImport: (file: File) => void;
}

export function ContactImport({ onImport }: ContactImportProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Import contacts from a CSV file. The file should contain name, email, and company columns.
      </p>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
        }}
        className="text-sm text-text-primary"
      />
      <Button type="button" onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}>
        Choose CSV file
      </Button>
    </div>
  );
}
