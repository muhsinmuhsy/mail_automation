'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

interface MergeTag {
  label: string;
  token: string;
}

interface TemplateFormProps {
  onSubmit: (data: { name: string; subject: string; body: string }) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
}

const BUILTIN_TAGS: MergeTag[] = [
  { label: 'Name', token: 'name' },
  { label: 'Email', token: 'email' },
  { label: 'Company', token: 'company' },
  { label: 'Job Title', token: 'job_title' },
  { label: 'First Name', token: 'first_name' },
];

/**
 * Merge-tag picker (§11.15). Renders a button that toggles a popover listing
 * built-in and custom field tokens. Clicking a token inserts `{{token}}` at
 * the cursor position of the target input/textarea.
 */
function MergeTagPicker({
  tags,
  targetRef,
  onInsert,
}: {
  tags: MergeTag[];
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInsert = (token: string) => {
    const el = targetRef.current;
    if (!el) {
      onInsert(token);
      setOpen(false);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const insertion = `{{${token}}}`;
    onInsert(el.value.slice(0, start) + insertion + el.value.slice(end));
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = start + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(!open)}
      >
        Insert merge tag
      </Button>
      {open && (
        <div className="absolute left-0 mt-2 w-56 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-neutral-200 bg-background py-1 shadow-[var(--shadow-elevated)] z-50">
          {tags.map((tag) => (
            <button
              key={tag.token}
              type="button"
              onClick={() => handleInsert(tag.token)}
              className="block w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-selected"
            >
              {tag.label} <span className="text-text-secondary">{'{{'}{tag.token}{'}}'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TemplateForm({ onSubmit, saving = false, error }: TemplateFormProps) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [customTags, setCustomTags] = useState<MergeTag[]>([]);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFields() {
      try {
        const response = await fetch('/api/contact-fields');
        const payload = (await response.json()) as {
          success: boolean;
          data?: Array<{ label: string; name: string }>;
        };
        if (!cancelled && payload.success && Array.isArray(payload.data)) {
          setCustomTags(
            payload.data.map((f) => ({
              label: f.label,
              token: f.name,
            }))
          );
        }
      } catch {
        // Non-fatal — the picker just shows built-in tags.
      }
    }
    void loadFields();
    return () => {
      cancelled = true;
    };
  }, []);

  const allTags = [...BUILTIN_TAGS, ...customTags];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, subject, body });
      }}
      className="flex flex-col gap-4"
    >
      <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="flex flex-col gap-1.5">
        <MergeTagPicker tags={allTags} targetRef={subjectRef} onInsert={setSubject} />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required ref={subjectRef} />
      </div>
      <div className="flex flex-col gap-1.5">
        <MergeTagPicker tags={allTags} targetRef={bodyRef} onInsert={setBody} />
        <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} required ref={bodyRef} />
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save template'}
      </Button>
    </form>
  );
}
