'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

interface PreviewData {
  html: string | null;
  text: string;
  subject: string;
}

/**
 * Template preview overlay.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §13. Hits POST /api/templates/[id]/preview
 * and renders the resolved HTML in a sandboxed iframe (scripts disabled).
 */
export function TemplatePreviewDialog({
  open,
  onOpenChange,
  templateId,
}: TemplatePreviewDialogProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTemplateId, setPrevTemplateId] = useState<string | null>(null);
  if (open !== prevOpen || (open && templateId !== prevTemplateId)) {
    setPrevOpen(open);
    setPrevTemplateId(templateId);
    if (open) {
      setPreview(null);
      setError(null);
      setLoading(true);
    }
  }

  const loadPreview = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch(`/api/templates/${id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as ApiEnvelope<PreviewData>;
      if (!payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load preview.');
      }
      setPreview(payload.data);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !templateId) return;
    void loadPreview(templateId);
  }, [open, templateId, loadPreview]);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-text-primary">Template preview</h2>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p role="alert" className="text-sm text-error">{error}</p>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface px-4 py-3">
              <p className="text-xs font-medium text-text-secondary">Subject</p>
              <p className="text-sm text-text-primary">{preview.subject}</p>
            </div>
            {preview.html ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview.html}
                className="h-[600px] w-full rounded-[var(--radius-md)] border border-neutral-200"
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4 text-sm text-text-primary">
                {preview.text}
              </pre>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
