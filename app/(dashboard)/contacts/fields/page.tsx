'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FieldForm, type FieldFormValues } from '@/components/settings/FieldForm';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 20;

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown';

interface ContactField {
  id: string;
  name: string;
  label: string;
  field_type: FieldType;
  options?: Array<{ value: string; label: string }> | null;
  sort_order: number;
  is_required: boolean;
  version: number;
}

interface FieldUsage {
  template_usage_count: number;
  contact_value_count: number;
  affected_template_names: string[];
  more_templates?: number;
}

type ApiEnvelope<T> =
  | { success: true; data: T; message?: string; pagination?: PaginationMeta }
  | { success: false; error: { message: string; fields?: Record<string, string> } };

const BUILTIN_FIELDS: Array<{ name: string; label: string; field_type: FieldType }> = [
  { name: 'name', label: 'Name', field_type: 'text' },
  { name: 'email', label: 'Email', field_type: 'text' },
];

export default function CustomFieldsPage() {
  const router = useRouter();
  const [fields, setFields] = useState<ContactField[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ContactField | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<FieldUsage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [togglingFieldId, setTogglingFieldId] = useState<string | null>(null);

  const load = useCallback(async (overridePage?: number) => {
    const effectivePage = overridePage ?? page;
    const params = new URLSearchParams({ page: String(effectivePage), limit: String(PAGE_SIZE) });
    try {
      const response = await fetch(`/api/contact-fields?${params.toString()}`);
      const payload = (await response.json()) as ApiEnvelope<ContactField[]>;
      if (!payload.success) {
        throw new Error(payload.error.message);
      }
      setFields(payload.data);
      setMeta(payload.pagination ?? null);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleCreate = async (values: FieldFormValues) => {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/contact-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          label: values.label,
          field_type: values.field_type,
          is_required: values.is_required,
          sort_order: fields.length,
          ...(values.options ? { options: values.options } : {}),
        }),
      });
      const payload = (await response.json()) as ApiEnvelope<ContactField>;
      if (!payload.success) {
        setFormError(payload.error.message);
        return;
      }
      setShowForm(false);
      setPage(1);
      await load(1);
    } catch {
      setFormError('Unable to save field.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRequired = async (field: ContactField) => {
    setTogglingFieldId(field.id);
    try {
      const response = await fetch(`/api/contact-fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_required: !field.is_required,
          version: field.version,
        }),
      });
      const payload = (await response.json()) as ApiEnvelope<ContactField>;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }
      await load();
    } catch {
      setError('Unable to update field.');
    } finally {
      setTogglingFieldId(null);
    }
  };

  const handleMove = async (field: ContactField, direction: 'up' | 'down') => {
    const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((f) => f.id === field.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const swapField = sorted[swapIndex];

    try {
      await Promise.all([
        fetch(`/api/contact-fields/${field.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swapField.sort_order, version: field.version }),
        }),
        fetch(`/api/contact-fields/${swapField.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: field.sort_order, version: swapField.version }),
        }),
      ]);
      await load();
    } catch {
      setError('Unable to reorder field.');
    }
  };

  const openDeleteDialog = async (field: ContactField) => {
    setDeleteTarget(field);
    setUsageLoading(true);
    try {
      const response = await fetch(`/api/contact-fields/${field.id}`, { method: 'GET' });
      const payload = (await response.json()) as ApiEnvelope<FieldUsage>;
      if (payload.success) {
        setDeleteUsage(payload.data);
      }
    } catch {
      // Non-fatal — the dialog still works without usage counts.
    } finally {
      setUsageLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/contact-fields/${deleteTarget.id}?version=${deleteTarget.version}`,
        { method: 'DELETE' }
      );
      const payload = (await response.json()) as ApiEnvelope<null>;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }
      setDeleteTarget(null);
      setDeleteUsage(null);
      await load();
    } catch {
      setError('Unable to delete field.');
    } finally {
      setDeleting(false);
    }
  };

  const sortedFields = [...fields].sort((a, b) => a.sort_order - b.sort_order);
  const existingTokens = fields.map((f) => f.name);

  const deleteDescription = deleteTarget && deleteUsage
    ? `Used by ${deleteUsage.template_usage_count} template${deleteUsage.template_usage_count === 1 ? '' : 's'}. Values on ${deleteUsage.contact_value_count} contact${deleteUsage.contact_value_count === 1 ? '' : 's'}.${deleteUsage.affected_template_names.length > 0 ? ` Affected: ${deleteUsage.affected_template_names.join(', ')}${deleteUsage.more_templates ? ` and ${deleteUsage.more_templates} more.` : ''}` : ''} This action cannot be undone.`
    : 'Are you sure you want to delete this field? This action cannot be undone.';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Custom Fields</h1>
          <p className="mt-2 text-text-secondary">
            Define custom merge fields for your contacts. Use them in templates as <code>{`{{token}}`}</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push('/contacts')}>Back</Button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
          >
            {showForm ? 'Cancel' : 'Add field'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Add field</h2>
          <FieldForm
            onSubmit={handleCreate}
            saving={saving}
            error={formError}
            existingTokens={existingTokens}
          />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {!showForm && (loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-3">Built-in fields</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {BUILTIN_FIELDS.map((field) => (
                <div
                  key={field.name}
                  className="rounded-[var(--radius-md)] border border-neutral-200 bg-neutral-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-text-primary">{field.label}</p>
                      <p className="text-sm text-text-secondary">
                        <code>{`{{${field.name}}}`}</code>
                      </p>
                    </div>
                    <span className="text-xs text-text-secondary bg-neutral-200 px-2 py-1 rounded">
                      Locked
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {sortedFields.length === 0 ? (
            <EmptyState
              title="No custom fields yet"
              description="Add your first custom field to personalize your emails."
            />
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-3">Custom fields</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-text-primary">{field.label}</p>
                        <p className="text-sm text-text-secondary">
                          <code>{`{{${field.name}}}`}</code> · {field.field_type}
                          {field.is_required && <span className="text-error"> · required</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMove(field, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMove(field, 'down')}
                          disabled={index === sortedFields.length - 1}
                        >
                          ↓
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={togglingFieldId !== null}
                          onClick={() => handleToggleRequired(field)}
                        >
                          {field.is_required ? 'Unrequire' : 'Require'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteDialog(field)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'field' : 'fields'}
              </p>
              <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      ))}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteUsage(null);
          }
        }}
        title="Delete field"
        description={usageLoading ? 'Loading usage…' : deleteDescription}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleting || usageLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
