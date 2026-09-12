'use client';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface NoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  buttonLabel?: string;
}

export function NoticeDialog({
  open,
  onOpenChange,
  title,
  description,
  buttonLabel = 'OK',
}: NoticeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end mt-4">
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {buttonLabel}
        </Button>
      </div>
    </Dialog>
  );
}
