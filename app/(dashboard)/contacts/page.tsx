'use client';

import { ContactList } from '@/components/contacts/ContactList';
import { ContactForm, type ContactFieldDef } from '@/components/contacts/ContactForm';
import { ContactImport } from '@/components/contacts/ContactImport';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type ApiResponse<T> = { data: T; message?: string; error?: { message: string }; pagination?: PaginationMeta };
type Contact = { id: string; name: string; email: string; custom_fields?: Record<string, string | null> };

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [fieldDefs, setFieldDefs] = useState<ContactFieldDef[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importSessionId, setImportSessionId] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    try {
      const response = await fetch('/api/contact-fields');
      const payload = (await response.json()) as {
        success: boolean;
        data?: Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }>;
      };
      if (payload.success && Array.isArray(payload.data)) {
        setFieldDefs(
          payload.data.map((f) => ({
            id: f.id,
            name: f.name,
            label: f.label,
            field_type: f.field_type as ContactFieldDef['field_type'],
            is_required: f.is_required,
          }))
        );
      }
    } catch {
      // Non-fatal — the form just won't show custom fields.
    }
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sortOrder });
    if (search) params.set('search', search);
    try {
      const response = await fetch(`/api/contacts?${params.toString()}`);
      const payload = (await response.json()) as ApiResponse<Contact[]>;
      if (!response.ok) throw new Error(payload.message || 'Unable to load contacts.');
      setContacts(payload.data);
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

  useEffect(() => {
    const timer = setTimeout(() => void loadFields(), 0);
    return () => clearTimeout(timer);
  }, [loadFields]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSortOrderChange = (value: 'desc' | 'asc') => {
    setSortOrder(value);
    setPage(1);
  };

  const handleSubmit = async (data: { name?: string; email: string; customFields?: Record<string, string> }) => {
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = { email: data.email };
      if (data.name) body.name = data.name;
      if (data.customFields) Object.assign(body, data.customFields);
      const response = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = (await response.json()) as ApiResponse<{ id: string; name: string; email: string }>;
      if (!response.ok) { const message = payload.message || 'Unable to save contact.'; setFormError(message); return; }
      setShowAddContact(false);
      setPage(1);
      await load();
    } catch {
      setFormError('Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File, createUnknown = false) => {
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('csv', file);
      if (createUnknown) formData.append('create_unknown_fields', 'true');
      if (importSessionId) formData.append('import_session_id', importSessionId);
      const response = await fetch('/api/contacts/import-csv', { method: 'POST', body: formData });
      const payload = (await response.json()) as ApiResponse<{
        imported: number;
        unknownColumns?: string[];
        requiresConfirmation?: boolean;
        import_session_id?: string;
      }>;
      if (!response.ok) { setError(payload.message || 'Unable to import contacts.'); return; }
      if (payload.data.requiresConfirmation && payload.data.unknownColumns) {
        setUnknownColumns(payload.data.unknownColumns);
        setPendingImportFile(file);
        if (payload.data.import_session_id) setImportSessionId(payload.data.import_session_id);
        return;
      }
      setUnknownColumns(null);
      setPendingImportFile(null);
      setImportSessionId(null);
      setShowImport(false);
      setPage(1);
      await load();
      await loadFields();
    } catch {
      setError('Unable to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${deleteTarget.id}`, { method: 'DELETE' });
      const payload = (await response.json()) as ApiResponse<null>;
      if (!response.ok) { setError(payload.error?.message || payload.message || 'Unable to delete contact.'); return; }
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Unable to delete contact.');
    } finally {
      setDeleting(false);
    }
  };

  const fieldLabels = Object.fromEntries(fieldDefs.map((f) => [f.name, f.label]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Contacts"
        description="Manage your contacts for campaigns."
        actions={
          <>
            <button
              onClick={() => { setShowAddContact(!showAddContact); setShowImport(false); }}
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
            >
              {showAddContact ? 'Cancel' : 'Add contact'}
            </button>
            <button
              onClick={() => { setShowImport(!showImport); setShowAddContact(false); }}
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-neutral-300 bg-background px-4 py-2 text-sm font-medium text-text-primary hover:bg-neutral-50"
            >
              {showImport ? 'Cancel' : 'Import'}
            </button>
            <button
              onClick={() => router.push('/contacts/fields')}
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-neutral-300 bg-background px-4 py-2 text-sm font-medium text-text-primary hover:bg-neutral-50"
            >
              Custom Fields
            </button>
          </>
        }
      />

      <ListToolbar search={search} onSearchChange={handleSearchChange} sortOrder={sortOrder} onSortOrderChange={handleSortOrderChange} />

      {showAddContact && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Add contact</h2>
          <ContactForm onSubmit={handleSubmit} saving={saving} error={formError} fields={fieldDefs} />
        </div>
      )}

      {showImport && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Import contacts</h2>
          <ContactImport
            onImport={(file) => void handleImport(file)}
            unknownColumns={unknownColumns ?? undefined}
            onCreateUnknown={() => {
              if (pendingImportFile) void handleImport(pendingImportFile, true);
            }}
            onCancelUnknown={() => {
              setUnknownColumns(null);
              setPendingImportFile(null);
              setImportSessionId(null);
            }}
            importing={importing}
          />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add your first contact or import from CSV."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <ContactList
            contacts={contacts}
            onDelete={(id) => setDeleteTarget(contacts.find((c) => c.id === id) ?? null)}
            onView={(id) => router.push(`/contacts/${id}`)}
            onEdit={(id) => router.push(`/contacts/${id}/edit`)}
            deleting={deleting}
            deletingId={deleteTarget?.id}
            fieldLabels={fieldLabels}
          />

          {meta && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'contact' : 'contacts'}
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
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete contact"
        description={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.name}? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
