'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface ContactImportProps {
  onImport: (file: File) => void;
}

export function ContactImport({ onImport }: ContactImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Import contacts from a CSV file. The file should contain name, email, and company columns.
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setSelectedFileName(file.name);
          onImport(file);
        }}
        className="sr-only"
      />
      <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
        Choose CSV file
      </Button>
      {selectedFileName && (
        <p className="text-caption text-text-secondary" role="status">
          Selected file: {selectedFileName}
        </p>
      )}
    </div>
  );
}
