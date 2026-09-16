'use client';

import { ATTACHMENT_TYPE_DESCRIPTION } from '@/lib/attachments/file-types';
import { AttachmentList } from '@/components/attachments/AttachmentList';
import { AttachmentUpload } from '@/components/attachments/AttachmentUpload';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NoticeDialog } from '@/components/ui/NoticeDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Attachment = { id: string; filename: string; size_bytes: number; is_default: boolean; created_at: string };
type ApiResponse<T> = { data: T; message?: string; error?: { message: string }; pagination?: PaginationMeta };

export default function AttachmentsPage() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (overridePage?: number) => {
    const effectivePage = overridePage ?? page;
    const params = new URLSearchParams({ page: String(effectivePage), limit: String(PAGE_SIZE), sortOrder });
    if (search) params.set('search', search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    try {
      const response = await fetch(`/api/attachments?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse<Attachment[]>;
      if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to load attachments.');
      setAttachments(payload.data);
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

  const handleSortOrderChange = (value: 'desc' | 'asc') => {
    setSortOrder(value);
    setPage(1);
  };

  const handleDateClear = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleDownload = (id: string) => {
    window.open(`/api/attachments/${id}`, '_blank');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/attachments/${deleteTarget.id}`, { method: 'DELETE' });
      const payload = (await response.json()) as ApiResponse<null>;
      if (!response.ok) {
        const message = payload.error?.message || payload.message || 'Unable to delete attachment.';
        if (response.status === 409) { setDeleteError(message); setDeleteTarget(null); }
        else { setError(message); }
        return;
      }
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Unable to delete attachment.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Attachments"
        description="Upload and manage your attachments."
        actions={<Button onClick={() => setUploadOpen(true)}>Upload Attachment</Button>}
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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Upload attachment" description={`${ATTACHMENT_TYPE_DESCRIPTION}. Up to 5 MB per file.`}>
        <AttachmentUpload onUpload={async (file) => {
          setError(null);
          const formData = new FormData(); formData.append('file', file);
          const response = await fetch('/api/attachments', { method: 'POST', body: formData });
          const payload = await response.json() as ApiResponse<Attachment>;
          if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to upload attachment.');
          setUploadOpen(false);
          setPage(1);
          await load(1);
        }} />
      </Dialog>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : attachments.length === 0 ? (
        <EmptyState
          title="No attachments uploaded yet"
          description="Upload your first attachment to get started."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <AttachmentList
            attachments={attachments}
            onDownload={handleDownload}
            onDelete={(id) => setDeleteTarget(attachments.find((a) => a.id === id) ?? null)}
            deleting={deleting}
            deletingId={deleteTarget?.id}
          />

          {meta && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'attachment' : 'attachments'}
              </p>
              {meta.totalPages > 1 && (
                <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete attachment"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.filename}"? This action cannot be undone.`
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
