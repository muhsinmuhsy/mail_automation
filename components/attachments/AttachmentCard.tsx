'use client';

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
  created_at?: string;
}

export function AttachmentCard({ attachment }: { attachment: Attachment }) {
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
    </div>
  );
}
