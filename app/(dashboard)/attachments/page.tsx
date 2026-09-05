'use client';

import { AttachmentCard } from '@/components/attachments/AttachmentCard';
import { AttachmentUpload } from '@/components/attachments/AttachmentUpload';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEffect, useState } from 'react';

type Attachment = { id: string; filename: string; size_bytes: number; is_default: boolean };
type ApiResponse<T> = { data: T; message?: string; error?: { message: string } };

export default function AttachmentsPage() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
const response = await fetch('/api/attachments');
        const payload = (await response.json()) as ApiResponse<Attachment[]>;
        if (!active) return;
        if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to load attachments.');
        setAttachments(payload.data);
      } catch (cause) {
        if (!active) return;
        setError((cause as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
<div>
        <h1 className="text-3xl font-semibold">Attachments</h1>
        <p className="mt-2 text-text-secondary">Upload and manage your attachments.</p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        <h2 className="text-lg font-semibold text-text-primary">Upload attachment</h2>
        <p className="text-sm text-text-secondary">PDF files only, max 5MB.</p>
        <div className="mt-4">
          <AttachmentUpload onUpload={async (file) => {
            setError(null);
            const formData = new FormData(); formData.append('file', file);
            const response = await fetch('/api/attachments', { method: 'POST', body: formData });
            const payload = await response.json() as ApiResponse<Attachment>;
            if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to upload attachment.');
            setAttachments((previous) => [...previous, payload.data]);
          }} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {attachments.length === 0 ? (
        <EmptyState
          title="No attachments uploaded yet"
          description="Upload your first attachment to get started."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {attachments.map((attachment) => (
            <AttachmentCard key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
}
