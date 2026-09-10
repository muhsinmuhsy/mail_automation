'use client';

import { useEffect, useRef } from 'react';
import type { TemplateContent, MergeTagsConfig } from '@templatical/types';

interface VisualEmailEditorProps {
  content?: TemplateContent;
  onChange?: (content: TemplateContent) => void;
  onError?: (error: Error) => void;
  mergeTags?: MergeTagsConfig;
}

/**
 * Visual email editor component wrapping the Templatical editor.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §5. This component is browser-only —
 * `init()` needs a DOM container. Mount via
 * `dynamic(() => import('@/components/templates/VisualEmailEditor'), { ssr: false })`.
 *
 * The editor is mounted inside a Shadow DOM (default) for CSS isolation from
 * the host page — host Tailwind v4 cannot bleed into the editor.
 *
 * Container constraints (§1 caveats): the container must have a defined height;
 * no `transform`/`filter`/`perspective`/`will-change`/`opacity<1`/`isolation`/
 * `contain`/positioned-`z-index` on ancestors.
 */
export function VisualEmailEditor({ content, onChange, onError, mergeTags }: VisualEmailEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function mountEditor() {
      const { init } = await import('@templatical/editor');
      if (cancelled || !containerRef.current) return;

      const editor = await init({
        container: containerRef.current,
        ...(content ? { content } : {}),
        shadowDom: true,
        ...(onChange ? { onChange } : {}),
        ...(onError ? { onError } : {}),
        ...(mergeTags ? { mergeTags } : {}),
      });

      if (cancelled) {
        editor.unmount();
        return;
      }

      editorRef.current = editor;
    }

    void mountEditor();

    return () => {
      cancelled = true;
      editorRef.current?.unmount();
      editorRef.current = null;
    };
  }, [content, onChange, onError, mergeTags]);

  return <div ref={containerRef} style={{ height: '100%', minHeight: '600px' }} />;
}

export default VisualEmailEditor;
