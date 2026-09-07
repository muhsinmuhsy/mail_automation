'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ATTACHMENT_ACCEPT } from '@/lib/attachments/file-types';
import { FileUpload } from '@/components/ui/FileUpload';

export function AttachmentUpload({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setPending(true);
        setError(null);
        try {
          await onUpload(file);
          setFile(null);
          setInputKey((previous) => previous + 1);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to upload attachment.');
        } finally {
          setPending(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <FileUpload key={inputKey} onFileChange={setFile} accept={ATTACHMENT_ACCEPT} maxSizeMB={5} />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={!file || pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}
