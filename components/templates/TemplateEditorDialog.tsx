'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import VisualEmailEditorLazy from '@/components/templates/VisualEmailEditorLazy';
import { StarterGallery } from '@/components/templates/StarterGallery';
import type { TemplateContent, MergeTagsConfig, MergeTag } from '@templatical/types';
import type { Starter } from '@/components/templates/starters/starterTemplates';

const BUILTIN_MERGE_TAGS: MergeTag[] = [
  { label: 'Name', value: 'name' },
  { label: 'Email', value: 'email' },
];

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
  const [step, setStep] = useState<'gallery' | 'editor'>(templateId ? 'editor' : 'gallery');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; subject?: string }>({});
  const [mergeTags, setMergeTags] = useState<MergeTagsConfig | undefined>(undefined);

  const contentRef = useRef<TemplateContent | null>(null);

  const isEdit = !!templateId;

  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTemplateId, setPrevTemplateId] = useState<string | null>(null);
  const currentTemplateId = templateId ?? null;
  if (open !== prevOpen || (open && currentTemplateId !== prevTemplateId)) {
    setPrevOpen(open);
    setPrevTemplateId(currentTemplateId);
    if (open) {
      setName('');
      setSubject('');
      setMode('visual');
      setContent(null);
      setPlainBody('');
      setError(null);
      setFieldErrors({});
      setLoading(templateId ? true : false);
      contentRef.current = null;
      setStep(templateId ? 'editor' : 'gallery');
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadMergeTags() {
      try {
        const response = await fetch('/api/contact-fields');
        const payload = (await response.json()) as ApiEnvelope<Array<{ label: string; name: string }>>;
        if (!cancelled && payload.success && Array.isArray(payload.data)) {
          const customTags: MergeTag[] = payload.data.map((f) => ({
            label: f.label,
            value: f.name,
          }));
          setMergeTags({ tags: [...BUILTIN_MERGE_TAGS, ...customTags] });
        } else if (!cancelled) {
          setMergeTags({ tags: BUILTIN_MERGE_TAGS });
        }
      } catch {
        if (!cancelled) {
          setMergeTags({ tags: BUILTIN_MERGE_TAGS });
        }
      }
    }
    void loadMergeTags();
    return () => { cancelled = true; };
  }, [open]);

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
    if (!open || !templateId) return;
    void loadTemplate(templateId);
  }, [open, templateId, loadTemplate]);

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

  const handlePickStarter = useCallback((starter: Starter) => {
    setSubject(starter.subject);
    if (starter.format === 'visual') {
      setMode('visual');
      setContent(starter.content);
      contentRef.current = starter.content;
      setPlainBody('');
    } else {
      setMode('plaintext');
      setPlainBody(starter.body);
      setContent(null);
      contentRef.current = null;
    }
    setError(null);
    setFieldErrors({});
    setStep('editor');
  }, []);

  const handleSave = async () => {
    const errors: { name?: string; subject?: string } = {};
    if (!name.trim()) errors.name = 'Template name is required.';
    if (!subject.trim()) errors.subject = 'Subject is required.';
    if (errors.name || errors.subject) {
      setFieldErrors(errors);
      return;
    }
    if (mode === 'visual') {
      const currentContent = contentRef.current ?? content;
      if (!currentContent || !currentContent.blocks || currentContent.blocks.length === 0) {
        setError('Please add at least one block to your email.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
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
      {step === 'gallery' ? (
        <>
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-text-primary">New template</h2>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
          <StarterGallery onPick={handlePickStarter} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-6 py-3">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-text-primary">
                {isEdit ? 'Edit template' : 'New template'}
              </h2>
              {!loading && (
                <Input
                  placeholder="Template name"
                  aria-label="Template name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setFieldErrors((fe) => ({ ...fe, name: undefined })); }}
                  error={fieldErrors.name}
                  required
                  className="w-64"
                />
              )}
            </div>
            {!loading && (
              <div className="flex items-center gap-3">
                <div role="tablist" aria-label="Editor mode" className="flex items-center gap-1">
                  <button
                    role="tab"
                    aria-selected={mode === 'visual'}
                    onClick={() => { setMode('visual'); setError(null); }}
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
                    onClick={() => { setMode('plaintext'); setError(null); }}
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
            )}
          </div>

          {!loading && (
            <div className="flex-shrink-0 border-b border-neutral-200 bg-surface px-6 py-3">
              <Input
                label="Subject"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setFieldErrors((fe) => ({ ...fe, subject: undefined })); }}
                error={fieldErrors.subject}
                required
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-error/30 bg-error/10 px-4 py-3">
                <p role="alert" className="text-sm text-error">{error}</p>
              </div>
            )}
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : mode === 'visual' ? (
              <div className="h-full">
                <VisualEmailEditorLazy
                  content={content ?? undefined}
                  onChange={handleEditorChange}
                  mergeTags={mergeTags}
                />
              </div>
            ) : (
              <textarea
                aria-label="Plain text body"
                className="h-full w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-information"
                value={plainBody}
                onChange={(e) => setPlainBody(e.target.value)}
                placeholder="Enter plain text email body. Use {{name}}, {{email}} for merge tags."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
