'use client';

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="flex flex-col gap-4">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">{attachment.filename}</p>
            <p className="text-sm text-text-secondary">{(attachment.size_bytes / 1024).toFixed(1)} KB</p>
          </div>
          {attachment.is_default && <span className="text-xs font-medium text-information">Default</span>}
        </div>
      ))}
    </div>
  );
}
