'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only dynamic import of the VisualEmailEditor.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §5. The editor must not SSR —
 * `init()` needs a DOM container. Use this wrapper in pages/layouts.
 */
const VisualEmailEditorLazy = dynamic(
  () => import('@/components/templates/VisualEmailEditor'),
  { ssr: false }
);

export default VisualEmailEditorLazy;
