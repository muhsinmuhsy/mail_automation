'use client';

import { TemplateCard } from '@/components/templates/TemplateCard';
import { TemplateEditorDialog } from '@/components/templates/TemplateEditorDialog';
import { TemplatePreviewDialog } from '@/components/templates/TemplatePreviewDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Template = { id: string; name: string; subject: string; created_at?: string };
type ApiEnvelope<T> =
  | { success: true; data: T; message?: string; pagination?: PaginationMeta }
  | { success: false; error: { message: string; fields?: Record<string, string> } };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sortOrder });
    if (search) params.set('search', search);
    try {
      const response = await fetch(`/api/templates?${params.toString()}`);
      const payload = (await response.json()) as ApiEnvelope<Template[]>;
      if (!payload.success) {
        throw new Error(payload.error.message);
      }
      setTemplates(payload.data);
      setMeta(payload.pagination ?? null);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSortOrderChange = (value: 'desc' | 'asc') => {
    setSortOrder(value);
    setPage(1);
  };

  const handleNew = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const handleEdit = (template: Template) => {
    setEditingId(template.id);
    setEditorOpen(true);
  };

  const handlePreview = (template: Template) => {
    setPreviewId(template.id);
    setPreviewOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Templates</h1>
        <p className="mt-2 text-text-secondary">Create and manage email templates.</p>
      </div>

      <ListToolbar search={search} onSearchChange={handleSearchChange} sortOrder={sortOrder} onSortOrderChange={handleSortOrderChange}>
        <button
          onClick={handleNew}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
        >
          New template
        </button>
      </ListToolbar>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create your first email template to get started."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={handleEdit}
                onPreview={handlePreview}
              />
            ))}
          </div>

          {meta && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'template' : 'templates'}
              </p>
              {meta.totalPages > 1 && (
                <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        templateId={editingId}
        onSaved={() => { setPage(1); void load(); }}
      />

      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        templateId={previewId}
      />
    </div>
  );
}
