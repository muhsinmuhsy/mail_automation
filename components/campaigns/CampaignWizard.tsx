'use client';

import { getAttachmentPolicy } from '@/lib/email/providers/attachment-policies';
import Link from 'next/link';
import { attachmentSelectionError, MAX_FILE_BYTES } from '@/lib/email/attachment-limits';
import { useMemo, useState } from 'react';
import { localDateTimeInZone, zonedDateTimeToIso, formatScheduledTime } from '@/lib/scheduling/time';
import { Button } from '@/components/ui/Button';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const steps = ['Campaign', 'Content', 'Contacts', 'Schedule', 'Review'];

export interface CampaignSelectOption {
  id: string;
  label: string;
  description?: string;
  size_bytes?: number | null;
  provider?: string;
}

export interface CampaignSubmitData {
  name: string;
  emailAccountId: string;
  attachmentIds: string[];
  templateId: string;
  contactIds: string[];
  startAt: string;
  timezone: string;
  intervalMinutes: number;
  dailyLimit: number | null;
}

interface CampaignWizardProps {
  emailAccounts?: CampaignSelectOption[];
  attachments?: CampaignSelectOption[];
  templates?: CampaignSelectOption[];
  contacts?: CampaignSelectOption[];
  loading?: boolean;
  onSubmit: (data: CampaignSubmitData) => void | Promise<void>;
}

function defaultLocalDateTime(): string {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  date.setSeconds(0, 0);
  return localDateTimeInZone(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}


function optionList(label: string, options: CampaignSelectOption[]) {
  if (options.length === 0) return [{ value: '', label }];
  return options.map((option) => ({ value: option.id, label: option.label }));
}

export function CampaignWizard({
  emailAccounts = [],
  attachments = [],
  templates = [],
  contacts = [],
  loading = false,
  onSubmit,
}: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emailAccountId, setEmailAccountId] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [startAt, setStartAt] = useState(defaultLocalDateTime);
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [intervalMinutes, setIntervalMinutes] = useState('5');
  const [dailyLimit, setDailyLimit] = useState('20');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const effectiveEmailAccountId = emailAccountId || emailAccounts[0]?.id || '';
  const selectedAttachments = attachments.filter(item => attachmentIds.includes(item.id));
  const provider = emailAccounts.find(account => account.id === effectiveEmailAccountId)?.provider ?? '';
  const attachmentPolicy = getAttachmentPolicy(provider);
  const attachmentError = effectiveEmailAccountId ? attachmentSelectionError(selectedAttachments, provider) : null;
  const attachmentBytes = selectedAttachments.reduce((sum, item) => sum + (item.size_bytes ?? MAX_FILE_BYTES), 0);
  const effectiveTemplateId = templateId || templates[0]?.id || '';

  const selected = useMemo(
    () => ({
      emailAccount: emailAccounts.find((item) => item.id === effectiveEmailAccountId),
      template: templates.find((item) => item.id === effectiveTemplateId),
    }),
    [effectiveEmailAccountId, effectiveTemplateId, emailAccounts, templates]
  );

  const validateStep = (targetStep = step) => {
    const nextErrors: Record<string, string> = {};
    if (targetStep === 0 && !name.trim()) {
      nextErrors.name = 'Campaign name is required.';
    }
    if (targetStep === 1) {
      if (!effectiveEmailAccountId) nextErrors.emailAccountId = 'Choose a sending account.';
      if (attachmentError) nextErrors.attachmentIds = attachmentError;
      if (!effectiveTemplateId) nextErrors.templateId = 'Choose a template.';
    }
    if (targetStep === 2 && contactIds.length === 0) {
      nextErrors.contactIds = 'Choose at least one contact.';
    }
    if (targetStep === 3) {
      const parsedInterval = Number(intervalMinutes);
      const parsedLimit = dailyLimit.trim() ? Number(dailyLimit) : null;
      try {
        zonedDateTimeToIso(startAt, timezone.trim());
      } catch (error) {
        nextErrors.startAt = error instanceof Error ? error.message : 'Choose a valid start time.';
      }
      if (!timezone.trim()) {
        nextErrors.timezone = 'Timezone is required.';
      }
      if (!Number.isInteger(parsedInterval) || parsedInterval <= 0) {
        nextErrors.intervalMinutes = 'Interval must be a positive whole number.';
      }
      if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        nextErrors.dailyLimit = 'Daily limit must be a positive whole number.';
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const canSubmit =
    name.trim() &&
    effectiveEmailAccountId &&
    !attachmentError &&
    effectiveTemplateId &&
    contactIds.length > 0 &&
    startAt &&
    timezone.trim() &&
    Number(intervalMinutes) > 0;

  const goNext = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = async () => {
    if (submitting) return;
    const originalStep = step;
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (!validateStep(index)) {
        setStep(index);
        return;
      }
    }
    setStep(originalStep);
    setSubmitting(true);
    try { await onSubmit({
      name: name.trim(),
      emailAccountId: effectiveEmailAccountId,
      attachmentIds,
      templateId: effectiveTemplateId,
      contactIds,
      startAt: zonedDateTimeToIso(startAt, timezone.trim()),
      timezone: timezone.trim(),
      intervalMinutes: Number(intervalMinutes),
      dailyLimit: dailyLimit.trim() ? Number(dailyLimit) : null,
    }); } finally { setSubmitting(false); }
  };

  const toggleContact = (id: string) => {
    setContactIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Campaign creation steps">
        {steps.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={index === step ? 'step' : undefined}
              className={`text-sm font-medium ${index <= step ? 'text-information' : 'text-text-secondary'}`}
            >
              {String(index + 1).padStart(2, '0')} {label}
            </span>
            {index < steps.length - 1 && <span className="h-px w-6 bg-neutral-200" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <p className="text-sm text-text-secondary">Step {step + 1} of {steps.length} ? {['Name your campaign so you can find it later.', 'Choose the sender, message template, and optional files.', 'Choose who will receive this campaign.', 'Set when emails start and how often they are sent.', 'Check your selections before scheduling.'][step]}</p>
      <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        {step === 0 ? (
          <Input
            label="Campaign name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            required
          />
        ) : loading && emailAccounts.length === 0 ? (
          <div role="status" aria-label="Preparing campaign choices" className="space-y-4 animate-pulse"><div className="h-10 rounded bg-surface" /><div className="h-24 rounded bg-surface" /></div>
        ) : step === 1 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Sending account"
              value={effectiveEmailAccountId}
              onChange={(event) => setEmailAccountId(event.target.value)}
              options={optionList('Select account', emailAccounts)}
              error={errors.emailAccountId}
              required
            />
            <Select
              label="Template"
              value={effectiveTemplateId}
              onChange={(event) => setTemplateId(event.target.value)}
              options={optionList('Select template', templates)}
              error={errors.templateId}
              required
            />
            <fieldset className="md:col-span-3 flex flex-col gap-3 border-t border-neutral-200 pt-5">
              <legend className="font-medium text-text-primary">Attachments (optional)</legend>
              <p id="attachment-help" className="text-sm text-text-secondary">Send without attachments, or choose files for {attachmentPolicy?.name ?? 'your sender'}. Up to {attachmentPolicy?.maxCount ?? 0} files, {(attachmentPolicy?.maxFileBytes ?? 0) / 1024 / 1024} MB each and {(attachmentPolicy?.maxTotalBytes ?? 0) / 1024 / 1024} MB total (app sending limits).</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span role="status">{attachmentIds.length} files selected ? {(attachmentBytes / 1024 / 1024).toFixed(1)} / {(attachmentPolicy?.maxTotalBytes ?? 0) / 1024 / 1024} MB</span>
                {attachmentIds.length > 0 && <Button variant="secondary" size="sm" onClick={() => setAttachmentIds([])}>Clear attachments</Button>}
              </div>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {attachments.map(file => <label key={file.id} className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-3 ${attachmentIds.includes(file.id) ? 'border-information bg-surface' : 'border-neutral-200'}`}>
                  <input type="checkbox" aria-describedby="attachment-help" checked={attachmentIds.includes(file.id)} onChange={() => setAttachmentIds(ids => ids.includes(file.id) ? ids.filter(id => id !== file.id) : [...ids, file.id])} className="h-4 w-4 accent-information" />
                  <span className="min-w-0 break-words text-sm">{file.label}<span className="block text-caption text-text-secondary">{file.size_bytes == null ? 'Size unavailable; reserves 5 MB' : `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB`}</span></span>
                </label>)}
              </div>
              {attachments.length === 0 && <p className="text-sm text-text-secondary">No files uploaded. You can continue without attachments.</p>}
              {attachmentError && <p role="alert" className="text-sm text-error">{attachmentError}</p>}
              <Link href="/attachments" target="_blank" className="text-sm text-information hover:underline">Upload files in Attachments (opens a new tab)</Link>
            </fieldset>
          </div>
        ) : step === 2 ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-text-primary">Contacts</legend>
            <Input label="Search contacts" value={contactSearch} onChange={event => setContactSearch(event.target.value)} />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>{contactIds.length} of {contacts.length} contacts selected</span>
              <Button variant="secondary" size="sm" onClick={() => setContactIds(contacts.map(contact => contact.id))}>Select all contacts</Button>
              <Button variant="secondary" size="sm" onClick={() => setContactIds([])} disabled={!contactIds.length}>Clear contacts</Button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-supporting text-text-secondary">Add at least one contact before launching a campaign.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {contacts.filter(contact => `${contact.label} ${contact.description ?? ''}`.toLowerCase().includes(contactSearch.toLowerCase())).map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-neutral-200 bg-background p-3 text-sm transition-colors hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={contactIds.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="mt-1 h-4 w-4 rounded-[var(--radius-sm)] border-neutral-300 text-information focus:ring-2 focus:ring-information"
                    />
                    <span>
                      <span className="block font-medium text-text-primary">{contact.label}</span>
                      {contact.description && (
                        <span className="block text-caption text-text-secondary">{contact.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errors.contactIds && <p className="text-xs text-error">{errors.contactIds}</p>}
          </fieldset>
        ) : step === 3 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateTimePicker
              label="Start time"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              error={errors.startAt}
              required
            />
            <Input
              label="Timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              error={errors.timezone}
              required
            />
            <Input
              label="Interval minutes"
              type="number"
              min={1}
              step={1}
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
              error={errors.intervalMinutes}
              required
            />
            <Input
              label="Daily limit"
              type="number"
              min={1}
              step={1}
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value)}
              error={errors.dailyLimit}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-section-title font-semibold text-text-primary">Ready to launch</h3>
              <p className="mt-1 text-body text-text-secondary">Review the campaign before scheduling emails.</p>
            </div>
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <dt className="text-caption text-text-secondary">Campaign</dt>
                <dd className="font-medium text-text-primary">{name || 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Sending account</dt>
                <dd className="font-medium text-text-primary">{selected.emailAccount?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Attachments</dt>
                <dd className="font-medium text-text-primary">{selectedAttachments.length ? selectedAttachments.map(file => file.label).join(', ') : 'No attachments'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Template</dt>
                <dd className="font-medium text-text-primary">{selected.template?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Contacts</dt>
                <dd className="font-medium text-text-primary">{contactIds.length} selected</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Schedule</dt>
                <dd className="font-medium text-text-primary">
                  Starts {formatScheduledTime(zonedDateTimeToIso(startAt, timezone.trim()), timezone.trim())} every {intervalMinutes} minutes
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Daily limit</dt>
                <dd className="font-medium text-text-primary">{dailyLimit.trim() || 'No campaign limit'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || submitting}>
          Back
        </Button>
        {step === steps.length - 1 ? (
          <Button onClick={submit} disabled={!canSubmit || loading || submitting}>
            {submitting ? 'Scheduling?' : 'Start campaign'}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={loading && step > 0 && emailAccounts.length === 0}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
