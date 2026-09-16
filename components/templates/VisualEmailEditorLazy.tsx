'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * Client-only dynamic import of the VisualEmailEditor.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §5. The editor must not SSR —
 * `init()` needs a DOM container. Use this wrapper in pages/layouts.
 */
const VisualEmailEditorLazy = dynamic(
  () => import('@/components/templates/VisualEmailEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    ),
  }
);

export default VisualEmailEditorLazy;
