'use client';

import { AttachmentCard } from './AttachmentCard';

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
  created_at?: string;
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="flex flex-col gap-4">
      {attachments.map((attachment) => (
        <AttachmentCard key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
