'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/ui/FileUpload';

export function ResumeUpload({ onUpload }: { onUpload: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onUpload(file);
      }}
      className="flex flex-col gap-4"
    >
      <FileUpload onFileChange={setFile} accept=".pdf" maxSizeMB={5} />
      <Button type="submit" disabled={!file}>
        Upload
      </Button>
    </form>
  );
}
