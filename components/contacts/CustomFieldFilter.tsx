'use client';

import { useState, useRef, useEffect } from 'react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { OPERATORS_BY_TYPE, type CustomFieldFilter } from '@/lib/contacts/custom-field-filter';

export interface CustomFieldDef {
  id: string;
  name: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'dropdown';
  options?: Array<{ value: string; label: string }>;
}

export interface ActiveFilter extends CustomFieldFilter {
  fieldLabel: string;
  fieldType: CustomFieldDef['field_type'];
  opLabel: string;
  valueLabel: string;
}

interface CustomFieldFilterProps {
  fields: CustomFieldDef[];
  activeFilters: ActiveFilter[];
  onAdd: (filter: ActiveFilter) => void;
}

export function CustomFieldFilter({ fields, activeFilters, onAdd }: CustomFieldFilterProps) {
  const [open, setOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [selectedOp, setSelectedOp] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        resetForm();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function resetForm() {
    setSelectedFieldId('');
    setSelectedOp('');
    setFilterValue('');
  }

  const availableFields = fields.filter(
    (f) => !activeFilters.some((af) => af.fieldId === f.id)
  );

  const fieldOptions = availableFields.map((f) => ({
    value: f.id,
    label: f.label,
  }));

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const operators = selectedField
    ? OPERATORS_BY_TYPE[selectedField.field_type] ?? []
    : [];
  const operatorOptions = operators.map((op) => ({
    value: op.value,
    label: op.label,
  }));

  function handleFieldSelect(e: { target: { value: string } }) {
    const fieldId = e.target.value;
    setSelectedFieldId(fieldId);
    const field = fields.find((f) => f.id === fieldId);
    if (field) {
      const ops = OPERATORS_BY_TYPE[field.field_type] ?? [];
      setSelectedOp(ops[0]?.value ?? '');
      setFilterValue('');
    }
  }

  function handleOpSelect(e: { target: { value: string } }) {
    setSelectedOp(e.target.value);
  }

  function canApply(): boolean {
    if (!selectedFieldId || !selectedOp) return false;
    if (selectedField?.field_type === 'boolean') return true;
    return filterValue.trim() !== '';
  }

  function handleApply() {
    if (!selectedField || !canApply()) return;
    const op = selectedOp;
    const opMeta = operators.find((o) => o.value === op);
    let value = filterValue;
    let valueLabel = filterValue;

    if (selectedField.field_type === 'boolean') {
      value = filterValue || 'true';
      valueLabel = value === 'true' ? 'Yes' : 'No';
    } else if (selectedField.field_type === 'dropdown') {
      const opt = selectedField.options?.find((o) => o.value === filterValue);
      valueLabel = opt?.label ?? filterValue;
    } else if (selectedField.field_type === 'date') {
      valueLabel = filterValue;
    }

    onAdd({
      fieldId: selectedField.id,
      fieldLabel: selectedField.label,
      fieldType: selectedField.field_type,
      op,
      value,
      opLabel: opMeta?.label ?? op,
      valueLabel,
    });
    resetForm();
    setOpen(false);
  }

  if (fields.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filter
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-4 shadow-[var(--shadow-elevated)] z-50">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Filter by custom field</h3>

          <div className="flex flex-col gap-3">
            <Select
              label="Field"
              options={fieldOptions}
              value={selectedFieldId}
              onChange={handleFieldSelect}
              placeholder="Select a field"
            />

            {selectedField && (
              <>
                {selectedField.field_type === 'boolean' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-primary">Value</label>
                    <Select
                      options={[
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' },
                      ]}
                      value={filterValue || 'true'}
                      onChange={(e) => setFilterValue(e.target.value)}
                    />
                  </div>
                ) : selectedField.field_type === 'dropdown' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-primary">Value</label>
                    <Select
                      options={(selectedField.options ?? []).map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      placeholder="Select a value"
                    />
                  </div>
                ) : (
                  <>
                    <Select
                      label="Condition"
                      options={operatorOptions}
                      value={selectedOp}
                      onChange={handleOpSelect}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="cf-filter-value" className="text-sm font-medium text-text-primary">Value</label>
                      <input
                        id="cf-filter-value"
                        type={selectedField.field_type === 'number' ? 'number' : selectedField.field_type === 'date' ? 'date' : 'text'}
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        className="h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1"
                      />
                    </div>
                  </>
                )}

                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={!canApply()}
                >
                  Apply filter
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
