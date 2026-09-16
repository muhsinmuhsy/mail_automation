'use client';

import { TemplateList } from '@/components/templates/TemplateList';
import { TemplateEditorDialog } from '@/components/templates/TemplateEditorDialog';
import { TemplatePreviewDialog } from '@/components/templates/TemplatePreviewDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NoticeDialog } from '@/components/ui/NoticeDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (overridePage?: number) => {
    const effectivePage = overridePage ?? page;
    const params = new URLSearchParams({ page: String(effectivePage), limit: String(PAGE_SIZE), sortOrder });
    if (search) params.set('search', search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    try {
      const response = await fetch(`/api/templates?${params.toString()}`);
      const payload = (await response.json()) as ApiEnvelope<Template[]>;
      if (!payload.success) throw new Error(payload.error.message);
      setTemplates(payload.data);
      setMeta(payload.pagination ?? null);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, sortOrder, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${deleteTarget.id}`, { method: 'DELETE' });
      const payload = (await response.json()) as ApiEnvelope<null>;
      if (!payload.success) {
        if (response.status === 409) { setDeleteError(payload.error.message); setDeleteTarget(null); }
        else { setError(payload.error.message); }
        return;
      }
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Unable to delete template.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSortOrderChange = (value: 'desc' | 'asc') => {
    setSortOrder(value);
    setPage(1);
  };

  const handleDateClear = () => {
    setStartDate('');
    setEndDate('');
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
      <PageHeader
        title="Templates"
        description="Create and manage email templates."
        actions={
          <Button variant="primary" onClick={handleNew}>
            New template
          </Button>
        }
      />

      <ListToolbar
        search={search}
        onSearchChange={handleSearchChange}
        sortOrder={sortOrder}
        onSortOrderChange={handleSortOrderChange}
        filters={
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={(v) => { setStartDate(v); setPage(1); }}
            onEndChange={(v) => { setEndDate(v); setPage(1); }}
            onClear={handleDateClear}
          />
        }
      />

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
          <TemplateList
            templates={templates}
            onEdit={handleEdit}
            onPreview={handlePreview}
            onDelete={(id) => setDeleteTarget(templates.find((t) => t.id === id) ?? null)}
            deleting={deleting}
            deletingId={deleteTarget?.id}
          />

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
        onSaved={() => { setPage(1); void load(1); }}
      />

      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        templateId={previewId}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete template"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This will also delete all campaigns and email jobs using this template. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />

      <NoticeDialog
        open={deleteError !== null}
        onOpenChange={(open) => { if (!open) setDeleteError(null); }}
        title="Cannot delete"
        description={deleteError ?? ''}
      />
    </div>
  );
}
