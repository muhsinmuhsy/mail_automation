'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ContactImportProps {
  onImport: (file: File) => void;
  /** When set, shows a "Create & Import" confirmation dialog for these columns. */
  unknownColumns?: string[];
  /** Called when the user confirms creating unknown fields. */
  onCreateUnknown?: () => void;
  /** Called when the user cancels the unknown-columns dialog. */
  onCancelUnknown?: () => void;
  /** Loading state for the import operation. */
  importing?: boolean;
}

export function ContactImport({
  onImport,
  unknownColumns,
  onCreateUnknown,
  onCancelUnknown,
  importing = false,
}: ContactImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Import contacts from a CSV file. The file should contain name, email, and any custom field columns by their token name (e.g. <code>size</code>, <code>plan</code>). Unknown columns will prompt you to create them as fields before importing.
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setSelectedFileName(file.name);
          onImport(file);
        }}
        className="sr-only"
      />
      <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={importing}>
        {importing ? 'Importing…' : 'Choose CSV file'}
      </Button>
      {selectedFileName && (
        <p className="text-caption text-text-secondary" role="status">
          Selected file: {selectedFileName}
        </p>
      )}
      <ConfirmDialog
        open={!!unknownColumns && unknownColumns.length > 0}
        onOpenChange={(open) => {
          if (!open) onCancelUnknown?.();
        }}
        title="Create new fields?"
        description={
          unknownColumns && unknownColumns.length > 0
            ? `The CSV contains columns that are not existing fields: ${unknownColumns.join(', ')}. Create these as new fields and import?`
            : ''
        }
        confirmLabel="Create & Import"
        cancelLabel="Cancel"
        onConfirm={() => onCreateUnknown?.()}
        loading={importing}
      />
    </div>
  );
}
