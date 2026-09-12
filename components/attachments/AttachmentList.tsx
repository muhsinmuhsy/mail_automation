'use client';

import { AttachmentCard } from './AttachmentCard';

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
  created_at?: string;
}

interface AttachmentListProps {
  attachments: Attachment[];
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
  deletingId?: string | null;
}

export function AttachmentList({ attachments, onDownload, onDelete, deleting = false, deletingId }: AttachmentListProps) {
  return (
    <div className="flex flex-col gap-4">
      {attachments.map((attachment) => (
        <AttachmentCard
          key={attachment.id}
          attachment={attachment}
          onDownload={onDownload}
          onDelete={onDelete}
          deleting={deleting && deletingId === attachment.id}
        />
      ))}
    </div>
  );
}
