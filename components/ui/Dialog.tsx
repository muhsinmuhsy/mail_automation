'use client';

import { useEffect } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-neutral-900/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50 w-full max-w-md rounded-[var(--radius-dialog)] border border-neutral-200 bg-background p-6 shadow-[var(--shadow-overlay)]">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-2 text-sm text-text-secondary">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
