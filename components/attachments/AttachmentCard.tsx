'use client';

import { Button } from '@/components/ui/Button';

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
  created_at?: string;
}

interface AttachmentCardProps {
  attachment: Attachment;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}

export function AttachmentCard({ attachment, onDownload, onDelete, deleting = false }: AttachmentCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{attachment.filename}</p>
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span>{(attachment.size_bytes / 1024).toFixed(1)} KB</span>
        {attachment.created_at && (
          <span className="text-supporting">
            {new Date(attachment.created_at).toLocaleDateString()}
          </span>
        )}
      </div>
      {(onDownload || onDelete) && (
        <div className="mt-3 flex gap-2">
          {onDownload && (
            <Button variant="secondary" size="sm" onClick={() => onDownload(attachment.id)}>Download</Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(attachment.id)} disabled={deleting}>Delete</Button>
          )}
        </div>
      )}
    </div>
  );
}
