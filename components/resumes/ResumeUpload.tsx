'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/ui/FileUpload';

export function ResumeUpload({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setPending(true);
        try {
          await onUpload(file);
          setFile(null);
        } finally {
          setPending(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <FileUpload onFileChange={setFile} accept=".pdf" maxSizeMB={5} />
      <Button type="submit" disabled={!file || pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}
