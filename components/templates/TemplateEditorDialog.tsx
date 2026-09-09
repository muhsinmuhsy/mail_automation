'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import VisualEmailEditorLazy from '@/components/templates/VisualEmailEditorLazy';
import type { TemplateContent } from '@templatical/types';

type EditorMode = 'visual' | 'plaintext';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string | null;
  onSaved?: () => void;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { message: string; fields?: Record<string, string> };
}

interface TemplateDetail {
  id: string;
  name: string;
  subject: string;
  body: string | null;
  body_json: string | null;
  body_html: string | null;
  body_text: string | null;
}

/**
 * Full-screen visual email editor overlay.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §13. Opens as a full-screen modal
 * (not a separate route) to respect the dashboard's list-only-page convention.
 * The visual editor is the default; a "Plain text" toggle switches to the
 * legacy textarea mode for simple templates.
 */
export function TemplateEditorDialog({
  open,
  onOpenChange,
  templateId,
  onSaved,
}: TemplateEditorDialogProps) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [mode, setMode] = useState<EditorMode>('visual');
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [plainBody, setPlainBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentRef = useRef<TemplateContent | null>(null);

  const isEdit = !!templateId;

  const reset = useCallback(() => {
    setName('');
    setSubject('');
    setMode('visual');
    setContent(null);
    setPlainBody('');
    setError(null);
    contentRef.current = null;
  }, []);

  const loadTemplate = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${id}`);
      const payload = (await response.json()) as ApiEnvelope<TemplateDetail>;
      if (!payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load template.');
      }
      const t = payload.data;
      setName(t.name);
      setSubject(t.subject);
      if (t.body_json) {
        try {
          const parsed = JSON.parse(t.body_json) as TemplateContent;
          setContent(parsed);
          contentRef.current = parsed;
          setMode('visual');
        } catch {
          setPlainBody(t.body_text ?? t.body ?? '');
          setMode('plaintext');
        }
      } else {
        setPlainBody(t.body_text ?? t.body ?? '');
        setMode('plaintext');
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state when dialog opens
    reset();
    if (templateId) {
      void loadTemplate(templateId);
    }
  }, [open, templateId, reset, loadTemplate]);

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

  const handleEditorChange = useCallback((next: TemplateContent) => {
    contentRef.current = next;
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) {
      setError('Name and subject are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body =
        mode === 'visual'
          ? { bodyJson: JSON.stringify(contentRef.current ?? content) }
          : { body: plainBody };
      const payload = { name, subject, ...body };

      const response = isEdit
        ? await fetch(`/api/templates/${templateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!result.success) {
        setError(result.error?.message ?? 'Unable to save template.');
        return;
      }
      onSaved?.();
      onOpenChange(false);
    } catch {
      setError('Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-text-primary">
          {isEdit ? 'Edit template' : 'New template'}
        </h2>
        <div className="flex items-center gap-3">
          <div role="tablist" aria-label="Editor mode" className="flex items-center gap-1">
            <button
              role="tab"
              aria-selected={mode === 'visual'}
              onClick={() => setMode('visual')}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
                mode === 'visual'
                  ? 'bg-information text-white'
                  : 'text-text-secondary hover:bg-selected'
              }`}
            >
              Visual
            </button>
            <button
              role="tab"
              aria-selected={mode === 'plaintext'}
              onClick={() => setMode('plaintext')}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
                mode === 'plaintext'
                  ? 'bg-information text-white'
                  : 'text-text-secondary hover:bg-selected'
              }`}
            >
              Plain text
            </button>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            Save template
          </Button>
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-neutral-200 px-6 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p role="alert" className="text-sm text-error">{error}</p>
          </div>
        ) : mode === 'visual' ? (
          <div className="h-full">
            <VisualEmailEditorLazy
              content={content ?? undefined}
              onChange={handleEditorChange}
            />
          </div>
        ) : (
          <textarea
            aria-label="Plain text body"
            className="h-full w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-information"
            value={plainBody}
            onChange={(e) => setPlainBody(e.target.value)}
            placeholder="Enter plain text email body. Use {{name}}, {{email}}, {{first_name}} for merge tags."
          />
        )}
      </div>
    </div>
  );
}
